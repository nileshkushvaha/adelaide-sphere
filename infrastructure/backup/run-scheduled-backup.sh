#!/usr/bin/env bash
# Scheduled encrypted database backup, one tier per run (SRS BACK 001/002).
#
#   run-scheduled-backup.sh --tier daily            # dump, prune to 30 days
#   run-scheduled-backup.sh --tier weekly           # promote today's daily, prune to 180 days
#   run-scheduled-backup.sh --tier daily --record-failure-only
#
# Called by adelaide-sphere-backup@.service; nothing else should call it. The
# schedule lives in tracked systemd units, never in the database and never in
# the admin UI, because SRS FUT 003 excludes administrator-authored cron
# expressions and shell commands.
#
# Written for bash 3.2 so it can be rehearsed on a developer's machine before it
# is trusted on the server: no mapfile, no associative arrays, no ${var,,}.
set -Eeuo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT="${BACKUP_ROOT:-/srv/adelaide-sphere}"
TIER=""
RECORD_FAILURE_ONLY=no
OFFSITE=disabled          # set before anything can fail, so the trap can read it

while [ $# -gt 0 ]; do
  case "$1" in
    --tier) TIER="${2:-}"; shift 2 ;;
    --record-failure-only) RECORD_FAILURE_ONLY=yes; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# A closed set, checked before any path is built from it.
case "$TIER" in
  daily|weekly) ;;
  *) echo 'Pass --tier daily or --tier weekly.' >&2; exit 2 ;;
esac

# $TIER is already a closed set, so this cannot escape; the check is here so that
# a mistyped BACKUP_ROOT in an edited unit file cannot point the retention pass
# at a directory nobody meant.
case "$ROOT" in
  /*/*) ;;
  *) echo "BACKUP_ROOT must be an absolute path at least two levels deep; got '$ROOT'." >&2; exit 2 ;;
esac
DAILY_DIR="$ROOT/backups/daily"
TIER_DIR="$ROOT/backups/$TIER"
STATE_DIR="$ROOT/backups/state"
STATE_FILE="$STATE_DIR/$TIER.state"

retention_days() {
  case "$1" in
    daily) echo 30 ;;
    # 180 days is a deliberate, recorded deviation from BACK 001's 30-day
    # baseline; see infrastructure/backup/README.md before changing it.
    weekly) echo 180 ;;
  esac
}

log() { printf '%s\n' "$*"; }
fail() { echo "$*" >&2; exit 1; }

# ---------------------------------------------------------------- state file

# One value from the state file. Parsed by allowlist and never sourced: this
# file is read by two languages and must not be able to execute anything.
prev_field() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -cd '0-9'
}

# $1 success (1|0), $2 the backup file or empty
write_state() {
  mkdir -p "$STATE_DIR"
  chmod 0750 "$STATE_DIR" 2>/dev/null || true
  now=$(date -u +%s)
  size=0
  if [ "$1" = 1 ]; then
    last_success=$now
    [ -n "${2:-}" ] && [ -f "${2:-}" ] && size=$(wc -c < "$2" | tr -d ' ')
    if [ "$OFFSITE" = ok ]; then offsite_success=$now; else offsite_success=$(prev_field offsite_last_success_epoch); fi
  else
    # A failed run must neither move the success clock forward nor erase it:
    # the alert measures time since the last *success*, so both would hide
    # exactly the outage it exists to report.
    last_success=$(prev_field last_success_epoch)
    offsite_success=$(prev_field offsite_last_success_epoch)
    size=$(prev_field size_bytes)
  fi
  if [ "$OFFSITE" = disabled ]; then configured=0; else configured=1; fi
  tmp=$(mktemp "$STATE_DIR/.$TIER.XXXXXX")
  {
    echo "schema=1"
    echo "tier=$TIER"
    echo "last_run_epoch=$now"
    echo "last_run_success=$1"
    echo "last_success_epoch=${last_success:-0}"
    echo "size_bytes=${size:-0}"
    echo "offsite_configured=$configured"
    echo "offsite_last_success_epoch=${offsite_success:-0}"
    echo "disk_free_bytes=${DISK_FREE:-0}"
  } > "$tmp"
  chmod 0640 "$tmp"
  # Renamed within one directory, so a reader never sees a half-written file.
  mv -f "$tmp" "$STATE_FILE"
}

# Every exit is recorded, not just the ones `set -e` catches. An ERR trap is not
# enough: most of the failures here are a deliberate `exit 1` from fail(), and an
# explicit exit does not fire ERR — those runs would have died without ever
# saying so in the state file, which is the one place the alert looks.
RUN_RECORDED=no
on_exit() {
  status=$?
  trap - EXIT
  if [ "$RUN_RECORDED" = no ]; then
    write_state 0 "" || true
    echo "The $TIER backup failed; recorded in $STATE_FILE." >&2
  fi
  exit "$status"
}
trap on_exit EXIT

if [ "$RECORD_FAILURE_ONLY" = yes ]; then
  # Invoked by the OnFailure unit, after the real run has already died.
  write_state 0 ""
  RUN_RECORDED=yes
  log "Recorded a failed $TIER backup in $STATE_FILE."
  exit 0
fi

# ------------------------------------------------------------------- helpers

# A timestamp N days or hours ago, in the same format the filenames use. BSD
# date (macOS, where this is rehearsed) and GNU date (the server) disagree
# about every flag involved, so both spellings are here on purpose.
stamp_ago() {
  if date -u -v-1d +%Y >/dev/null 2>&1; then
    date -u -v-"$1$2" +%Y%m%dT%H%M%SZ
  else
    case "$2" in d) unit=days ;; H) unit=hours ;; *) fail "stamp_ago: bad unit $2" ;; esac
    date -u -d "$1 $unit ago" +%Y%m%dT%H%M%SZ
  fi
}

# The UTC stamp inside a backup filename, or non-zero if there isn't one.
stamp_of() {
  name=${1##*/}
  stamp=$(printf '%s' "$name" | sed -n 's/.*\([0-9]\{8\}T[0-9]\{6\}Z\).*/\1/p')
  [ -n "$stamp" ] || return 1
  printf '%s' "$stamp"
}

# Every encrypted backup in a directory, in no particular order.
list_all_backups() {
  # shellcheck disable=SC2012 # `find` would recurse and reorder; these names are
  # written by backup-database.sh and contain no whitespace or newlines.
  ls -1 "$1"/*.age "$1"/*.gpg 2>/dev/null || true
}

# Newest first, and *only* files whose name carries a UTC stamp. Sorted by that
# stamp rather than by mtime: a copy, an rsync or a restore from the off-site
# archive rewrites timestamps, and neither "which file is newest" nor the
# retention pass may change its mind when that happens. The format is
# fixed-width and zero-padded, so a string sort is a chronological sort.
#
# Anything else in the directory — a file restored by hand, a half-finished
# download — is excluded here and left alone by the retention pass. It must
# never be able to sort to the front and be mistaken for the newest backup,
# which is the file the weekly tier promotes.
list_backups() {
  # shellcheck disable=SC2012 # as above: one directory, names this script controls.
  ls -1 "$1"/*.age "$1"/*.gpg 2>/dev/null \
    | sed -n 's|.*/\(.*[0-9]\{8\}T[0-9]\{6\}Z.*\)$|'"$1"'/\1|p' \
    | sort -r || true
}

# Free bytes on the filesystem holding a directory. `df -Pk` is the POSIX
# spelling both BSD and GNU understand; -P keeps one record per line even when
# the device name is long enough to wrap.
free_bytes_at() {
  df -Pk "$1" 2>/dev/null | awk 'NR == 2 { printf "%.0f", $4 * 1024 }'
}

# Refuse to start a dump that could fill the disk. A backup is not worth taking
# the database down for: MySQL on a full filesystem stops accepting writes, and
# the site stops with it. Checked before the dump, never after.
DISK_FREE=0
check_free_space() {
  mkdir -p "$1"
  DISK_FREE=$(free_bytes_at "$1")
  [ -n "$DISK_FREE" ] || { echo "Could not read free space for $1; continuing without the guard." >&2; DISK_FREE=0; return 0; }
  floor_mb=$(env_file_value "$ROOT/shared/backup.env" BACKUP_MIN_FREE_MB)
  [ -n "$floor_mb" ] || floor_mb=1024
  floor=$((floor_mb * 1024 * 1024))
  # Also insist on room for several more backups the size of the last one, so a
  # database that has grown is caught before the filesystem is the thing that
  # notices.
  last=$(prev_field size_bytes)
  [ -n "$last" ] || last=0
  headroom=$((last * 3))
  required=$floor
  [ "$headroom" -gt "$required" ] && required=$headroom
  if [ "$DISK_FREE" -lt "$required" ]; then
    fail "Only $((DISK_FREE / 1024 / 1024)) MB free on $1; this run needs $((required / 1024 / 1024)) MB. Refusing to start a backup that could fill the disk and stop MySQL. Free space or raise BACKUP_MIN_FREE_MB."
  fi
  log "disk: $((DISK_FREE / 1024 / 1024)) MB free, $((required / 1024 / 1024)) MB required"
}

# ------------------------------------------------------------------ preflight

command -v node >/dev/null 2>&1 || fail 'node is not on PATH. The unit runs with a restricted environment; install Node system-wide or set the path in the unit.'
[ -r "$ROOT/shared/api.env" ] || fail "Cannot read $ROOT/shared/api.env"
[ -r "$ROOT/shared/backup.env" ] || fail "Cannot read $ROOT/shared/backup.env"
[ -r "$ROOT/shared/backup-recipient.txt" ] || fail "Cannot read $ROOT/shared/backup-recipient.txt"

# shellcheck source=./db-target.sh
# shellcheck disable=SC1091 # resolved at run time, beside this script.
. "$HERE/db-target.sh"

DB_TARGET=$(db_target_from_env_file "$ROOT/shared/api.env")
read -r DERIVED_HOST DERIVED_PORT DB_NAME <<EOF
$DB_TARGET
EOF
[ -n "$DERIVED_HOST" ] && [ -n "$DERIVED_PORT" ] && [ -n "$DB_NAME" ] || fail 'Could not read the database host, port and name from DATABASE_URL.'

# The overrides exist for one known case: where `mysqldump` is a wrapper that
# runs the client *inside* the MySQL container, the published host port is not
# the port the client should dial. Both values are printed every run so the
# journal shows which one was actually used.
OFFSITE_REMOTE="$(env_file_value "$ROOT/shared/backup.env" BACKUP_OFFSITE_REMOTE)"
DB_HOST="$(env_file_value "$ROOT/shared/backup.env" BACKUP_DB_HOST)"
DB_PORT="$(env_file_value "$ROOT/shared/backup.env" BACKUP_DB_PORT)"
DB_USER="$(env_file_value "$ROOT/shared/backup.env" BACKUP_DB_USER)"
[ -n "$DB_HOST" ] || DB_HOST="$DERIVED_HOST"
[ -n "$DB_PORT" ] || DB_PORT="$DERIVED_PORT"
# The read-only backup account the server provisions (deployment guide 6.6).
# Overridable because the account name is environment configuration, not a
# constant: a rehearsal on a developer's machine has no such account.
[ -n "$DB_USER" ] || DB_USER=adelaide_sphere_backup
[ -n "$OFFSITE_REMOTE" ] || OFFSITE_REMOTE="${BACKUP_OFFSITE_REMOTE:-}"

log "tier=$TIER database=$DB_NAME user=$DB_USER derived=$DERIVED_HOST:$DERIVED_PORT effective=$DB_HOST:$DB_PORT"

# --------------------------------------------------------------------- backup

# Sets TARGET. Deliberately not a command substitution: this function's stdout
# carries the backup script's own progress output, which would otherwise be
# captured into the path.
take_daily_backup() {
  mkdir -p "$DAILY_DIR"
  binlog_flag=""
  if [ "${BACKUP_NO_BINLOG_POSITION:-}" = 1 ]; then
    # Only for a rehearsal against an account without RELOAD. On the server this
    # must stay off: without the binlog position there is no point-in-time
    # recovery, and the one-hour RPO in BACK 001 cannot be met.
    echo 'WARNING: BACKUP_NO_BINLOG_POSITION=1 — this backup cannot support point-in-time recovery (SRS BACK 001).' >&2
    binlog_flag="--no-binlog-position"
  fi
  # An age recipient needs age. Without it backup-database.sh falls back to gpg,
  # which either fails on an unusable recipient or — if BACKUP_PASSPHRASE happens
  # to be set — quietly writes a passphrase-encrypted file instead of one the
  # recorded age key can open. Both are found at restore time, which is too late.
  case "$(cat "$ROOT/shared/backup-recipient.txt")" in
    age1*) command -v age >/dev/null 2>&1 || fail 'The backup recipient is an age key but age is not installed. Install age; do not let this fall back to gpg.' ;;
  esac
  (
    umask 077
    MYSQL_PWD="$(env_file_value "$ROOT/shared/backup.env" MYSQL_BACKUP_PASSWORD)"
    [ -n "$MYSQL_PWD" ] || { echo "No MYSQL_BACKUP_PASSWORD in $ROOT/shared/backup.env" >&2; exit 1; }
    export MYSQL_PWD
    "$HERE/backup-database.sh" \
      --host "$DB_HOST" --port "$DB_PORT" \
      --user "$DB_USER" --database "$DB_NAME" \
      --out "$DAILY_DIR" --recipient "$(cat "$ROOT/shared/backup-recipient.txt")" \
      $binlog_flag
  )
  TARGET=$(list_backups "$DAILY_DIR" | head -1)
  [ -n "$TARGET" ] && [ -s "$TARGET" ] || fail 'The dump reported success but no backup file is present.'
}

# The weekly tier is the same file the daily tier already produced and verified,
# linked under a directory with a longer retention — not a second dump. A second
# dump an hour later buys no extra recovery ground (the RPO comes from binlogs),
# costs a second full dump-gzip-encrypt on a small shared VPS, and can fail on
# its own schedule, which would leave the archive quietly empty.
# Sets TARGET, for the same reason as take_daily_backup.
promote_newest_daily() {
  mkdir -p "$TIER_DIR"
  src=$(list_backups "$DAILY_DIR" | head -1)
  [ -n "$src" ] || fail "No daily backup to promote. Check adelaide-sphere-backup@daily."
  src_stamp=$(stamp_of "$src") || fail "The newest daily backup has no timestamp in its name: $src"
  cutoff=$(stamp_ago 48 H)
  # Without this, a broken daily job would keep the weekly clock looking fresh
  # by re-promoting the same stale file every Sunday.
  [ "$src_stamp" \> "$cutoff" ] || fail "The newest daily backup ($src) is older than 48 hours; refusing to promote it."
  [ -f "$src.sha256" ] || fail "The daily backup has no checksum beside it: $src.sha256"

  dst="$TIER_DIR/${src##*/}"
  if [ -e "$dst" ]; then
    # Persistent=true replays a missed run; promoting twice must be harmless.
    log "weekly already holds ${src##*/}; nothing to promote."
    TARGET="$dst"
    return 0
  fi
  ln "$src" "$dst" 2>/dev/null || cp -p "$src" "$dst"
  # shasum records "<hash>  <path as it was given>", so the daily file's
  # checksum names the daily path. Rewriting it to the promoted name both
  # repairs that and lets the check below prove the link or copy landed intact.
  hash=$(cut -d' ' -f1 < "$src.sha256")
  [ -n "$hash" ] || fail "Could not read the checksum in $src.sha256"
  printf '%s  %s\n' "$hash" "${dst##*/}" > "$dst.sha256"
  ( cd "$TIER_DIR" && shasum -a 256 -c "${dst##*/}.sha256" >/dev/null ) \
    || fail "The promoted weekly file failed its checksum: $dst"
  log "Promoted ${src##*/} into the weekly archive."
  TARGET="$dst"
}

check_free_space "$TIER_DIR"

TARGET=""
if [ "$TIER" = daily ]; then
  take_daily_backup
else
  promote_newest_daily
fi
[ -n "$TARGET" ] && [ -f "$TARGET" ] || fail 'No backup file to report; refusing to claim success.'

# -------------------------------------------------------------------- offsite

# A backup on the same disk is not a backup (BACK 002). Unconfigured is a
# deliberate no-op rather than an error, so a box without a remote yet still
# takes local backups; configured-but-broken is a failure, because a remote
# that silently stops copying is the worst of both.
if [ -z "$OFFSITE_REMOTE" ]; then
  OFFSITE=disabled
  log 'offsite: BACKUP_OFFSITE_REMOTE is not set — local copy only (SRS BACK 002 unmet).'
else
  command -v rclone >/dev/null 2>&1 || fail 'BACKUP_OFFSITE_REMOTE is set but rclone is not installed.'
  rclone copyto "$TARGET" "$OFFSITE_REMOTE/$TIER/${TARGET##*/}"
  rclone copyto "$TARGET.sha256" "$OFFSITE_REMOTE/$TIER/${TARGET##*/}.sha256"
  OFFSITE=ok
  log "offsite: copied ${TARGET##*/} to $OFFSITE_REMOTE/$TIER/"
fi
# Nothing here ever deletes off-site. BACK 002 asks for storage that production
# credentials cannot delete from, so the remote's own object lock or lifecycle
# policy owns expiry there. That is a decision, not an omission.

# --------------------------------------------------------------------- prune

prune_tier() {
  dir=$1
  days=$2
  min_keep=2
  cutoff=$(stamp_ago "$days" d)
  files=$(list_backups "$dir")
  if [ -z "$files" ]; then
    log "prune: $dir holds no backups; nothing to do."
    return 0
  fi
  kept=0
  # Fed by here-string rather than a pipe: in bash 3.2 a piped `while` runs in a
  # subshell, and the counter that enforces min_keep would be lost.
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    kept=$((kept + 1))
    # Never leave fewer than two, at any age. One surviving backup that turns
    # out to be corrupt is not a backup.
    [ "$kept" -le "$min_keep" ] && continue
    stamp=$(stamp_of "$file") || {
      echo "prune: $file has no timestamp in its name; keeping it." >&2
      continue
    }
    [ "$stamp" \< "$cutoff" ] || continue
    rm -f -- "$file" "$file.sha256"
    log "prune: removed ${file##*/} (older than $days days)"
  done <<EOF
$files
EOF
  # Anything the ordering excluded is kept, and said out loud. A retention pass
  # that quietly deletes what it does not understand is how people lose
  # everything.
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if ! stamp_of "$file" >/dev/null 2>&1; then
      echo "prune: ${file##*/} has no timestamp in its name; keeping it." >&2
    fi
  done <<EOF
$(list_all_backups "$dir")
EOF
  # Sweep checksums whose backup is gone; never the other way round.
  for checksum in "$dir"/*.sha256; do
    [ -e "$checksum" ] || continue
    [ -e "${checksum%.sha256}" ] || rm -f -- "$checksum"
  done
  survivors=$(list_backups "$dir" | grep -c . || true)
  [ "${survivors:-0}" -ge 1 ] || fail "prune left $dir with no backups at all; this is a bug, not a retention policy."
  log "prune: $dir keeps $survivors backup(s), retention ${days}d."
}

prune_tier "$TIER_DIR" "$(retention_days "$TIER")"

# ---------------------------------------------------------------------- done

write_state 1 "$TARGET"
RUN_RECORDED=yes
log "$TIER backup complete: $TARGET"
