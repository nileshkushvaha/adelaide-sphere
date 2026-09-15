#!/usr/bin/env bash
# Encrypted logical database backup (SRS BACK 001).
#
#   MYSQL_PWD="$(read-secret)" ./backup-database.sh --host db.internal --user backup \
#     --database adelaide_sphere --out /var/backups/adelaide-sphere --recipient ops@example
#
# The password is read from MYSQL_PWD so it never appears in the process list or
# in shell history. Output is gzipped and encrypted before it is written; an
# unencrypted dump never touches the disk. Encryption uses `age` when it is
# installed, otherwise `gpg`. With gpg, --recipient may be a key id (public-key
# encryption) or, when BACKUP_PASSPHRASE is set, the backup is symmetric.
set -Eeuo pipefail

HOST=""; USER=""; DATABASE=""; OUT_DIR=""; RECIPIENT=""; PORT="3306"; BINLOG_POSITION="yes"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --recipient) RECIPIENT="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    # For drills against an account without RELOAD/BINLOG ADMIN. A production
    # backup must record the position, or point-in-time recovery is impossible.
    --no-binlog-position) BINLOG_POSITION="no"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for required in HOST USER DATABASE OUT_DIR RECIPIENT; do
  if [[ -z "${!required}" ]]; then
    echo "Missing --${required,,}. See the header of this script." >&2
    exit 2
  fi
done
if [[ -z "${MYSQL_PWD:-}" ]]; then
  echo "Set MYSQL_PWD from your secret store; this script never takes a password on the command line." >&2
  exit 2
fi

if [[ "$BINLOG_POSITION" == "yes" ]]; then
  BINLOG_ARGS="--source-data=2 --set-gtid-purged=AUTO"
else
  BINLOG_ARGS="--set-gtid-purged=OFF"
  echo "WARNING: --no-binlog-position: this backup cannot support point-in-time recovery (SRS BACK 001)." >&2
fi

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if command -v age >/dev/null 2>&1; then
  ENCRYPTION="age"
  TARGET="${OUT_DIR}/${DATABASE}-${STAMP}.sql.gz.age"
elif command -v gpg >/dev/null 2>&1; then
  ENCRYPTION="gpg"
  TARGET="${OUT_DIR}/${DATABASE}-${STAMP}.sql.gz.gpg"
else
  echo "Neither age nor gpg is installed; refusing to write an unencrypted backup." >&2
  exit 2
fi

# --single-transaction keeps InnoDB consistent without locking writers;
# --source-data records the binlog position so point-in-time recovery can
# replay up to the one-hour RPO (SRS BACK 001).
encrypt() {
  if [[ "$ENCRYPTION" == "age" ]]; then
    age --recipient "$RECIPIENT" --output "$TARGET"
  elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$TARGET" 3<<<"$BACKUP_PASSPHRASE"
  else
    gpg --batch --yes --encrypt --recipient "$RECIPIENT" --output "$TARGET"
  fi
}

mysqldump \
  --host="$HOST" --port="$PORT" --user="$USER" \
  --single-transaction --quick --routines --events --triggers \
  ${BINLOG_ARGS} \
  --default-character-set=utf8mb4 \
  "$DATABASE" \
  | gzip -9 \
  | encrypt

SIZE=$(wc -c < "$TARGET")
if [[ "$SIZE" -lt 1024 ]]; then
  echo "Backup at $TARGET is only ${SIZE} bytes; treat this as a failure." >&2
  exit 1
fi

# A checksum recorded next to the file lets the restore drill prove integrity.
shasum -a 256 "$TARGET" > "${TARGET}.sha256"
echo "Wrote ${TARGET} (${SIZE} bytes, ${ENCRYPTION}) and its SHA-256."
echo "Copy it to storage that production credentials cannot delete (SRS BACK 002)."
