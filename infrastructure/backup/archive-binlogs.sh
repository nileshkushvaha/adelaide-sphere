#!/usr/bin/env bash
# Copy MySQL's binary logs off-site, hourly (SRS BACK 001: one-hour RPO).
#
#   archive-binlogs.sh
#
# Called by adelaide-sphere-binlog-archive.service. The daily dump records the
# binlog position it was taken at; this job keeps the logs *after* that position
# somewhere that survives the server. Without it, "recover to one hour ago" is
# only possible while the server that holds the binlogs still exists, which is
# exactly the case a backup does not need to cover. Losing the VPS would lose
# every change since the last daily dump — up to a day.
#
# Each run closes the open binary log (FLUSH BINARY LOGS), then encrypts every
# closed log not yet archived and copies it off-site with its checksum. The
# worst-case loss after a server loss is therefore the time since the last run,
# plus whatever was still in the open log.
#
# All MySQL access goes through `docker exec` into the MySQL container, so the
# client always matches the server and the host's port mapping is irrelevant.
# The raw files are read the same way; mysqlbinlog is not needed here (the
# official 8.4 image does not ship it) — only the restore needs it.
#
# Written for bash 3.2, like the rest of this directory.
set -Eeuo pipefail

ROOT="${BACKUP_ROOT:-/srv/adelaide-sphere}"
case "$ROOT" in
  /*/*) ;;
  *) echo "BACKUP_ROOT must be an absolute path at least two levels deep; got '$ROOT'." >&2; exit 2 ;;
esac

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./db-target.sh
# shellcheck disable=SC1091
. "$HERE/db-target.sh"

ARCHIVE_DIR="$ROOT/backups/binlogs"
LEDGER="$ARCHIVE_DIR/uploaded.list"
STATE_DIR="$ROOT/backups/state"
STATE_FILE="$STATE_DIR/binlog-archive.state"
# Encrypted copies are kept locally for a little longer than the server keeps
# the logs themselves (binlog_expire_logs_seconds = 7 days), so a retry after a
# long off-site outage still has them. The off-site copy is the real archive.
LOCAL_KEEP_DAYS=8

log() { printf '%s\n' "$*"; }
fail() { echo "$*" >&2; exit 1; }
setting() { env_file_value "$ROOT/shared/backup.env" "$1"; }

prev_field() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -cd '0-9'
}

# Same shape as the other state files, so the worker reads it with one parser.
write_state() {
  mkdir -p "$STATE_DIR"
  chmod 0750 "$STATE_DIR" 2>/dev/null || true
  now=$(date -u +%s)
  if [ "$1" = 1 ]; then last_success=$now; else last_success=$(prev_field last_success_epoch); fi
  tmp=$(mktemp "$STATE_DIR/.binlog-archive.XXXXXX")
  {
    echo "schema=1"
    echo "tier=binlog-archive"
    echo "last_run_epoch=$now"
    echo "last_run_success=$1"
    echo "last_success_epoch=${last_success:-0}"
    echo "size_bytes=${ARCHIVED_BYTES:-0}"
    echo "offsite_configured=${2:-0}"
    echo "offsite_last_success_epoch=${last_success:-0}"
    echo "disk_free_bytes=0"
  } > "$tmp"
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}

CONFIGURED=0
ARCHIVED_BYTES=0
RUN_RECORDED=no
on_exit() {
  status=$?
  trap - EXIT
  if [ "$RUN_RECORDED" = no ]; then
    write_state 0 "$CONFIGURED" || true
    echo "The binlog archive failed; recorded in $STATE_FILE." >&2
  fi
  exit "$status"
}
trap on_exit EXIT

REMOTE=$(setting BACKUP_OFFSITE_REMOTE)
if [ -z "$REMOTE" ]; then
  # Archiving binlogs next to the binlogs themselves protects nothing, so with
  # no remote this does not even flush. It says what that means, every hour.
  log 'binlog archive: BACKUP_OFFSITE_REMOTE is not set — nothing is archived.'
  log 'binlog archive: after a server loss, recovery is to the last daily dump that left the server, not to within an hour (SRS BACK 001 unmet).'
  write_state 1 0
  RUN_RECORDED=yes
  exit 0
fi
CONFIGURED=1

CONTAINER=$(setting BINLOG_MYSQL_CONTAINER)
[ -n "$CONTAINER" ] || CONTAINER=as-mysql
DB_USER=$(setting BACKUP_DB_USER)
[ -n "$DB_USER" ] || DB_USER=adelaide_sphere_backup
RECIPIENT=$(cat "$ROOT/shared/backup-recipient.txt" 2>/dev/null || true)
[ -n "$RECIPIENT" ] || fail "Cannot read $ROOT/shared/backup-recipient.txt"

command -v docker >/dev/null 2>&1 || fail 'docker is not on PATH; binlogs are read from inside the MySQL container.'
command -v rclone >/dev/null 2>&1 || fail 'BACKUP_OFFSITE_REMOTE is set but rclone is not installed.'
[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = true ] \
  || fail "The MySQL container '$CONTAINER' is not running; no binlogs were archived."

# Same rules as backup-database.sh, plus its guard: an age recipient needs age,
# never a silent fall back to gpg.
case "$RECIPIENT" in
  age1*)
    command -v age >/dev/null 2>&1 || fail 'The backup recipient is an age key but age is not installed.'
    SUFFIX=age ;;
  *)
    command -v gpg >/dev/null 2>&1 || fail 'Neither age nor gpg is available; refusing to archive binlogs unencrypted.'
    SUFFIX=gpg ;;
esac
encrypt_to() {
  if [ "$SUFFIX" = age ]; then
    age --recipient "$RECIPIENT" --output "$1"
  elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$1" 3<<EOF
$BACKUP_PASSPHRASE
EOF
  else
    gpg --batch --yes --encrypt --recipient "$RECIPIENT" --output "$1"
  fi
}

MYSQL_PWD=$(setting MYSQL_BACKUP_PASSWORD)
[ -n "$MYSQL_PWD" ] || fail "No MYSQL_BACKUP_PASSWORD in $ROOT/shared/backup.env"
export MYSQL_PWD
# `-e MYSQL_PWD` with no value hands the variable over from this environment, so
# the password never appears in docker's own command line.
sql() {
  docker exec -e MYSQL_PWD "$CONTAINER" \
    mysql -h 127.0.0.1 -P 3306 -u "$DB_USER" -N -B -e "$1"
}

[ "$(sql 'SELECT @@log_bin')" = 1 ] || fail 'Binary logging is OFF on this server; point-in-time recovery is impossible until it is enabled.'
BINLOG_DIR=$(dirname "$(sql 'SELECT @@log_bin_basename')")

# Close the open log so everything up to now is in a file that can be copied.
# Needs RELOAD, which the backup account already has for --source-data.
sql 'FLUSH BINARY LOGS'
LOGS=$(sql 'SHOW BINARY LOGS' | awk '{ print $1 }')
[ -n "$LOGS" ] || fail 'SHOW BINARY LOGS returned nothing.'
ACTIVE=$(printf '%s\n' "$LOGS" | tail -1)
CLOSED=$(printf '%s\n' "$LOGS" | sed '$d')

mkdir -p "$ARCHIVE_DIR"
touch "$LEDGER"

number_of() { printf '%s' "${1##*.}" | sed 's/^0*//'; }

# A binlog that expired before it was archived is a hole in the chain: replay
# stops there, and every change after it is unrecoverable from this archive.
# That must be loud, not a quiet skip.
LAST_ARCHIVED=$(tail -1 "$LEDGER")
FIRST_AVAILABLE=$(printf '%s\n' "$LOGS" | head -1)
if [ -n "$LAST_ARCHIVED" ]; then
  last_n=$(number_of "$LAST_ARCHIVED")
  first_n=$(number_of "$FIRST_AVAILABLE")
  if [ -n "$last_n" ] && [ -n "$first_n" ] && [ "$first_n" -gt $((last_n + 1)) ]; then
    fail "Binlog gap: the last archived log is $LAST_ARCHIVED but the oldest the server still has is $FIRST_AVAILABLE. The logs between were purged before they were archived, so point-in-time recovery is broken until the next daily dump. Investigate why this job did not run."
  fi
fi

count=0
for name in $CLOSED; do
  case "$name" in *[!A-Za-z0-9._-]*) fail "Unexpected binlog name '$name'; refusing to use it in a path." ;; esac
  grep -qx "$name" "$LEDGER" && continue
  out="$ARCHIVE_DIR/$name.$SUFFIX"
  if [ ! -s "$out" ]; then
    tmp="$out.partial"
    rm -f "$tmp"
    docker exec "$CONTAINER" cat "$BINLOG_DIR/$name" | encrypt_to "$tmp"
    [ -s "$tmp" ] || { rm -f "$tmp"; fail "Encrypting $name produced an empty file."; }
    mv -f "$tmp" "$out"
    ( cd "$ARCHIVE_DIR" && shasum -a 256 "${out##*/}" ) > "$out.sha256"
  fi
  rclone copyto "$out" "$REMOTE/binlogs/${out##*/}"
  rclone copyto "$out.sha256" "$REMOTE/binlogs/${out##*/}.sha256"
  # Recorded only once both files are off-site, so a failed upload is retried.
  echo "$name" >> "$LEDGER"
  ARCHIVED_BYTES=$((ARCHIVED_BYTES + $(wc -c < "$out" | tr -d ' ')))
  count=$((count + 1))
  log "binlog archive: $name -> $REMOTE/binlogs/"
done

# Local copies of logs already off-site are only a retry buffer. Pruned by
# mtime, which is right here: these files are never copied or restored in
# place, and the ledger, not the file, is what says a log is safe.
find "$ARCHIVE_DIR" -maxdepth 1 -type f \( -name '*.age' -o -name '*.gpg' -o -name '*.sha256' \) -mtime +"$LOCAL_KEEP_DAYS" -print \
  | while IFS= read -r old; do
      base=${old##*/}; base=${base%.sha256}; base=${base%.age}; base=${base%.gpg}
      grep -qx "$base" "$LEDGER" && rm -f -- "$old"
    done

write_state 1 1
RUN_RECORDED=yes
log "binlog archive: $count log(s) archived; open log is $ACTIVE."
