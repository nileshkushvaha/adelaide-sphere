#!/usr/bin/env bash
# Mirror the media bucket to off-site storage (SRS BACK 001, MED 001).
#
#   mirror-media.sh
#
# Called hourly by adelaide-sphere-media-mirror.service. BACK 001 allows media
# replication to lag by at most one hour.
#
# The database backup contains no uploaded files — only rows that point at them.
# Without this, losing the server loses every photograph on the site while the
# database restores perfectly and shows broken images.
#
# Written for bash 3.2, like the rest of this directory, so it can be rehearsed
# on a developer's machine.
set -Eeuo pipefail

ROOT="${BACKUP_ROOT:-/srv/adelaide-sphere}"
case "$ROOT" in
  /*/*) ;;
  *) echo "BACKUP_ROOT must be an absolute path at least two levels deep; got '$ROOT'." >&2; exit 2 ;;
esac

STATE_DIR="$ROOT/backups/state"
STATE_FILE="$STATE_DIR/media-mirror.state"
CONTAINER="${MEDIA_MIRROR_CONTAINER:-as-minio}"

log() { printf '%s\n' "$*"; }
fail() { echo "$*" >&2; exit 1; }

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./db-target.sh
# shellcheck disable=SC1091
. "$HERE/db-target.sh"

prev_field() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -cd '0-9'
}

# Same shape as the database backup's state files, so one reader serves both.
write_state() {
  mkdir -p "$STATE_DIR"
  chmod 0750 "$STATE_DIR" 2>/dev/null || true
  now=$(date -u +%s)
  if [ "$1" = 1 ]; then last_success=$now; else last_success=$(prev_field last_success_epoch); fi
  tmp=$(mktemp "$STATE_DIR/.media-mirror.XXXXXX")
  {
    echo "schema=1"
    echo "tier=media-mirror"
    echo "last_run_epoch=$now"
    echo "last_run_success=$1"
    echo "last_success_epoch=${last_success:-0}"
    echo "size_bytes=0"
    echo "offsite_configured=${2:-0}"
    echo "offsite_last_success_epoch=${last_success:-0}"
    echo "disk_free_bytes=0"
  } > "$tmp"
  chmod 0640 "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}

CONFIGURED=0
RUN_RECORDED=no
on_exit() {
  status=$?
  trap - EXIT
  if [ "$RUN_RECORDED" = no ]; then
    write_state 0 "$CONFIGURED" || true
    echo "The media mirror failed; recorded in $STATE_FILE." >&2
  fi
  exit "$status"
}
trap on_exit EXIT

SOURCE_BUCKET="$(env_file_value "$ROOT/shared/backup.env" MEDIA_MIRROR_SOURCE)"
[ -n "$SOURCE_BUCKET" ] || SOURCE_BUCKET="local/adelaide-sphere-media"
TARGET_BUCKET="$(env_file_value "$ROOT/shared/backup.env" MEDIA_MIRROR_TARGET)"

if [ -z "$TARGET_BUCKET" ]; then
  # Deliberately not an error: a host with no remote yet is not failing at
  # mirroring. It is, however, not meeting BACK 001, and says so every hour.
  CONFIGURED=0
  log "media mirror: MEDIA_MIRROR_TARGET is not set in shared/backup.env — nothing is copied off-site."
  log "media mirror: uploaded files exist only on this server (SRS BACK 001 unmet)."
  write_state 1 0
  RUN_RECORDED=yes
  exit 0
fi
CONFIGURED=1

command -v docker >/dev/null 2>&1 || fail 'docker is not on PATH; the media mirror runs mc inside the MinIO container.'
docker inspect --format '{{.State.Running}}' "$CONTAINER" >/dev/null 2>&1 \
  || fail "The MinIO container '$CONTAINER' is not running; nothing was mirrored."

log "media mirror: $SOURCE_BUCKET -> $TARGET_BUCKET (container $CONTAINER)"

# --overwrite replaces changed objects. There is deliberately no --remove: this
# mirror must never delete at the far end. A delete here would turn an accident
# or a compromise on this server into the same loss off-site, which is the whole
# thing the off-site copy exists to prevent (SRS BACK 002). Objects that go away
# locally are aged out by the bucket's own lifecycle policy instead.
docker exec "$CONTAINER" mc mirror --overwrite "$SOURCE_BUCKET" "$TARGET_BUCKET"

write_state 1 1
RUN_RECORDED=yes
log 'media mirror complete.'
