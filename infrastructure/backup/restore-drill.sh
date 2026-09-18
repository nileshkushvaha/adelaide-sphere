#!/usr/bin/env bash
# Restore verification drill (SRS BACK 002). Restores an encrypted backup into
# an ISOLATED database and verifies it. It refuses to touch a database whose
# name does not end in _restore, so it can never overwrite production.
#
#   MYSQL_PWD="$(read-secret)" ./restore-drill.sh --file backup.sql.gz.age \
#     --identity ~/.age/ops.key --host 127.0.0.1 --user restore --database adelaide_sphere_restore
#
# Point-in-time recovery (BACK 001, one-hour RPO): add --binlog-dir with the
# archived binary logs (as archive-binlogs.sh uploads them). After the dump is
# restored, the logs are replayed from the position the dump recorded, up to
# --stop-datetime if given ('YYYY-MM-DD HH:MM:SS', always UTC) or to the end.
# Replay needs a mysqlbinlog at least as new as the server (8.4); the official
# MySQL 8.4 image does not include one. Events are rewritten from
# --source-database (default: the target name without _restore) into the target.
set -Eeuo pipefail

FILE=""; IDENTITY=""; HOST=""; USER=""; DATABASE=""; PORT="3306"; STATE_DIR=""
BINLOG_DIR=""; STOP_DATETIME=""; SOURCE_DATABASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --identity) IDENTITY="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    # Records the drill time so the "restore drill overdue" alert can see it.
    --state-dir) STATE_DIR="$2"; shift 2 ;;
    --binlog-dir) BINLOG_DIR="$2"; shift 2 ;;
    --stop-datetime) STOP_DATETIME="$2"; shift 2 ;;
    --source-database) SOURCE_DATABASE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
# The identity is only needed for age-encrypted backups.
if [[ "$FILE" == *.age ]]; then REQUIRED_VARS=(FILE IDENTITY HOST USER DATABASE); else REQUIRED_VARS=(FILE HOST USER DATABASE); fi
for required in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!required}" ]]; then echo "Missing --$(printf '%s' "$required" | tr '[:upper:]' '[:lower:]')." >&2; exit 2; fi
done
if [[ "$DATABASE" != *_restore ]]; then
  echo "Refusing to restore into '${DATABASE}': the target database name must end in _restore." >&2
  exit 2
fi
if [[ -z "${MYSQL_PWD:-}" ]]; then echo "Set MYSQL_PWD from your secret store." >&2; exit 2; fi
if [[ -n "$BINLOG_DIR" ]]; then
  [[ -d "$BINLOG_DIR" ]] || { echo "--binlog-dir $BINLOG_DIR is not a directory." >&2; exit 2; }
  command -v "${MYSQLBINLOG:-mysqlbinlog}" >/dev/null 2>&1 || {
    echo "Replaying binlogs needs mysqlbinlog (8.4 or newer) on this machine; set MYSQLBINLOG to its path." >&2; exit 2; }
  [[ -n "$SOURCE_DATABASE" ]] || SOURCE_DATABASE="${DATABASE%_restore}"
fi

# Every connection the drill makes runs with sql_log_bin=0. A drill run on the
# production server would otherwise write its whole restore — DROP DATABASE,
# CREATE, every row — into the production binary log. That bloats the log by a
# full copy of the database per drill and, worse, puts those events into the
# archive, where a later replay into a database of the same name would apply
# the old drill's DROP DATABASE over the recovered data. Setting it needs
# SESSION_VARIABLES_ADMIN (see the deployment guide, 15.5).
db() { mysql --host="$HOST" --port="$PORT" --user="$USER" --init-command="SET SESSION sql_log_bin = 0" "$@"; }

# Verifies a file against the hash recorded beside it, wherever the file now is.
verify_checksum() {
  local file=$1 expected actual
  [[ -f "$file.sha256" ]] || { echo "  no .sha256 beside ${file##*/}"; return 0; }
  expected=$(awk 'NR == 1 { print $1 }' "$file.sha256")
  actual=$(shasum -a 256 "$file" | awk '{ print $1 }')
  if [[ -z "$expected" || "$expected" != "$actual" ]]; then
    echo "  checksum MISMATCH for ${file##*/}: recorded ${expected:-nothing}, file is ${actual}" >&2
    return 1
  fi
}

echo "1/5 Verifying the checksum"
# Compared by hash rather than with `shasum -c`, which looks for whatever path
# the checksum names: older files record the absolute path on the server, which
# does not exist once the backup has been downloaded somewhere to be restored.
verify_checksum "$FILE" && echo "  ${FILE##*/}: checksum OK"

echo "2/5 Creating the isolated target database"
db -e "DROP DATABASE IF EXISTS \`${DATABASE}\`; CREATE DATABASE \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "3/5 Restoring"
START=$(date +%s)
decrypt_file() {
  if [[ "$1" == *.age ]]; then
    age --decrypt --identity "$IDENTITY" "$1"
  elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    gpg --batch --quiet --decrypt --passphrase-fd 3 "$1" 3<<<"$BACKUP_PASSPHRASE"
  else
    gpg --batch --quiet --decrypt "$1"
  fi
}
decrypt() { decrypt_file "$FILE"; }
decrypt | gunzip | db "$DATABASE"

if [[ -n "$BINLOG_DIR" ]]; then
  echo "3b/5 Replaying binary logs (point-in-time recovery)"
  # The position the dump was taken at, from the comment --source-data=2
  # writes near the top. Reading only the head ends the pipe early, which is
  # expected, so pipefail is off for this one line.
  # The decryptor's "broken pipe" complaint is that early end, not a fault.
  POSITION_LINE=$(set +o pipefail; decrypt 2>/dev/null | gunzip 2>/dev/null | head -n 100 | grep -m1 -E 'CHANGE (REPLICATION SOURCE|MASTER) TO' || true)
  START_FILE=$(printf '%s' "$POSITION_LINE" | sed -n "s/.*_LOG_FILE='\([^']*\)'.*/\1/p")
  START_POS=$(printf '%s' "$POSITION_LINE" | sed -n 's/.*_LOG_POS=\([0-9]*\).*/\1/p')
  if [[ -z "$START_FILE" || -z "$START_POS" ]]; then
    echo "  This dump recorded no binlog position (taken with --no-binlog-position?); it cannot be rolled forward." >&2
    exit 1
  fi
  echo "  dump was taken at ${START_FILE}:${START_POS}"
  PREFIX=${START_FILE%.*}
  START_N=$((10#${START_FILE##*.}))
  # One flat directory of names this project wrote. `sed -E` because BSD sed
  # (a Mac is a likely recovery machine) has no \| in basic regular expressions.
  # shellcheck disable=SC2012
  REPLAY=$(ls -1 "$BINLOG_DIR" | sed -En "s/^(${PREFIX}\.[0-9]+)\.(age|gpg)\$/\1.\2/p" | sort)
  [[ -n "$REPLAY" ]] || { echo "  No archived ${PREFIX}.* logs in $BINLOG_DIR." >&2; exit 1; }
  WORK=$(mktemp -d); chmod 700 "$WORK"
  trap 'rm -rf "$WORK"' EXIT
  EXPECT_N=$START_N; REPLAYED=0
  STOP_ARGS=(); [[ -n "$STOP_DATETIME" ]] && STOP_ARGS=(--stop-datetime="$STOP_DATETIME")
  for archived in $REPLAY; do
    name=${archived%.*}; n=$((10#${name##*.}))
    (( n < START_N )) && continue
    if (( n != EXPECT_N )); then
      # A missing log means every change after it is lost to this recovery.
      echo "  Gap in the archive: expected ${PREFIX}.$(printf '%06d' "$EXPECT_N"), found $name. Stopping." >&2
      exit 1
    fi
    POS_ARGS=(); (( n == START_N )) && POS_ARGS=(--start-position="$START_POS")
    POS_ARGS_CHECK=(${POS_ARGS[@]+"${POS_ARGS[@]}"})
    verify_checksum "$BINLOG_DIR/$archived"
    decrypt_file "$BINLOG_DIR/$archived" > "$WORK/$name"
    # Events written *directly* to the target name (by an earlier drill run
    # before drills stopped logging) pass the --database filter too, because
    # the rewrite happens first. Replaying them would re-run that drill over
    # this one. Refuse, and name the way out, rather than corrupt silently.
    # Counted, not `grep -q`: -q exits at the first match, mysqlbinlog then dies
    # of SIGPIPE, and under pipefail the pipeline reads as "not found" — the
    # check would be blind exactly when it found something.
    FOREIGN=$("${MYSQLBINLOG:-mysqlbinlog}" --database="$DATABASE" \
        ${POS_ARGS_CHECK[@]+"${POS_ARGS_CHECK[@]}"} "$WORK/$name" 2>/dev/null \
        | grep -cE "^(use \`${DATABASE}\`|#.*Table_map: \`${DATABASE}\`)" || true)
    if [[ "${FOREIGN:-0}" -gt 0 ]]; then
      echo "  $name already contains writes made directly to \`$DATABASE\` (an earlier drill on this server)." >&2
      echo "  Restore into a name that has never been used, e.g. --database ${SOURCE_DATABASE}_pitr_restore --source-database ${SOURCE_DATABASE}." >&2
      exit 1
    fi
    # --skip-gtids so events are applied even on a server that has already
    # executed them; --rewrite-db is applied before --database, so the filter
    # names the target.
    # Two steps, each checked, rather than `mysqlbinlog | mysql`. As a pipeline,
    # a mysqlbinlog that never ran still let mysql succeed on empty input, and
    # the drill reported a replay that had not happened — with exit status 0.
    #
    # TZ=UTC: mysqlbinlog reads --stop-datetime in the local timezone of the
    # machine running it, so without this the same command stops at a different
    # moment on a laptop in another zone than on the server.
    # --skip-gtids so events are applied even on a server that has already
    # executed them; --rewrite-db is applied before --database, so the filter
    # names the target.
    # ${ARR[@]+"${ARR[@]}"}: bash 3.2, which macOS ships, treats an empty array
    # as unbound under `set -u`.
    if ! TZ=UTC "${MYSQLBINLOG:-mysqlbinlog}" --skip-gtids \
        --rewrite-db="${SOURCE_DATABASE}->${DATABASE}" --database="$DATABASE" \
        ${POS_ARGS[@]+"${POS_ARGS[@]}"} ${STOP_ARGS[@]+"${STOP_ARGS[@]}"} \
        "$WORK/$name" > "$WORK/$name.sql"; then
      echo "  mysqlbinlog failed on $name; nothing after it was replayed." >&2
      exit 1
    fi
    [[ -s "$WORK/$name.sql" ]] || { echo "  mysqlbinlog produced no output for $name." >&2; exit 1; }
    if ! db "$DATABASE" < "$WORK/$name.sql"; then
      echo "  Applying $name failed; the restored database stops before it." >&2
      exit 1
    fi
    rm -f "$WORK/$name.sql"
    rm -f "$WORK/$name"
    REPLAYED=$((REPLAYED + 1)); EXPECT_N=$((n + 1))
  done
  (( REPLAYED > 0 )) || { echo "  The archive has no log at or after ${START_FILE}; nothing replayed." >&2; exit 1; }
  echo "  replayed ${REPLAYED} log(s) from ${START_FILE}:${START_POS}${STOP_DATETIME:+ to $STOP_DATETIME}"
fi
END=$(date +%s)

echo "4/5 Verifying schema and content"
db "$DATABASE" -N -e "
  SELECT CONCAT('  tables: ', COUNT(*)) FROM information_schema.tables WHERE table_schema = '${DATABASE}';
  SELECT CONCAT('  wrong collation: ', COUNT(*)) FROM information_schema.tables WHERE table_schema = '${DATABASE}' AND table_collation <> 'utf8mb4_unicode_ci';
  SELECT CONCAT('  businesses: ', COUNT(*)) FROM businesses;
  SELECT CONCAT('  published businesses: ', COUNT(*)) FROM businesses WHERE status = 'published';
  SELECT CONCAT('  posts: ', COUNT(*)) FROM posts;
  SELECT CONCAT('  media assets: ', COUNT(*)) FROM media_assets;
  SELECT CONCAT('  admin users: ', COUNT(*)) FROM admin_users;
  SELECT CONCAT('  pending outbox events: ', COUNT(*)) FROM outbox_events WHERE status = 'pending';
"

echo "5/5 Result"
echo "  restore took $((END - START))s (record this as the measured RTO)"

# Same shape as the scheduled backup's state files, so the worker publishes the
# drill age from the same reader (SRS BACK 002 quarterly drill, alert I4).
if [[ -n "$STATE_DIR" ]]; then
  mkdir -p "$STATE_DIR"
  NOW=$(date -u +%s)
  TMP=$(mktemp "$STATE_DIR/.restore-drill.XXXXXX")
  {
    echo "schema=1"
    echo "tier=restore-drill"
    echo "last_run_epoch=$NOW"
    echo "last_run_success=1"
    echo "last_success_epoch=$NOW"
    echo "size_bytes=0"
    echo "offsite_configured=0"
    echo "offsite_last_success_epoch=0"
  } > "$TMP"
  chmod 0640 "$TMP"
  mv -f "$TMP" "$STATE_DIR/restore-drill.state"
  echo "  recorded in $STATE_DIR/restore-drill.state"
fi

# Which tier the backup came from decides how far back the deletion replay must
# reach, so the file name is echoed here rather than left to memory.
printf '  restored from: %s\n' "${FILE##*/}"
cat <<'NOTES'
  Still to do by hand, and to record in the drill report:
    - replay privacy deletion records made after the backup point. A backup from
      the WEEKLY archive can be up to 180 days old, so the replay must cover the
      whole period back to the backup point, not the 30 days a daily restore
      implies. Restoring a weekly archive without the wider replay puts back
      personal data the retention jobs have already purged (SRS PRIV 002).
    - verify media checksums against object storage
    - rebuild caches and queues from the restored rows (the outbox is authoritative)
    - confirm outbound mail is disabled in the isolated environment before starting any worker
    - measure the gap between the backup point and now: that is the RPO for this drill
NOTES
