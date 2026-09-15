#!/usr/bin/env bash
# Restore verification drill (SRS BACK 002). Restores an encrypted backup into
# an ISOLATED database and verifies it. It refuses to touch a database whose
# name does not end in _restore, so it can never overwrite production.
#
#   MYSQL_PWD="$(read-secret)" ./restore-drill.sh --file backup.sql.gz.age \
#     --identity ~/.age/ops.key --host 127.0.0.1 --user restore --database adelaide_sphere_restore
set -Eeuo pipefail

FILE=""; IDENTITY=""; HOST=""; USER=""; DATABASE=""; PORT="3306"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="$2"; shift 2 ;;
    --identity) IDENTITY="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --database) DATABASE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
# The identity is only needed for age-encrypted backups.
if [[ "$FILE" == *.age ]]; then REQUIRED_VARS=(FILE IDENTITY HOST USER DATABASE); else REQUIRED_VARS=(FILE HOST USER DATABASE); fi
for required in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!required}" ]]; then echo "Missing --${required,,}." >&2; exit 2; fi
done
if [[ "$DATABASE" != *_restore ]]; then
  echo "Refusing to restore into '${DATABASE}': the target database name must end in _restore." >&2
  exit 2
fi
if [[ -z "${MYSQL_PWD:-}" ]]; then echo "Set MYSQL_PWD from your secret store." >&2; exit 2; fi

echo "1/5 Verifying the checksum"
if [[ -f "${FILE}.sha256" ]]; then shasum -a 256 -c "${FILE}.sha256"; else echo "  no .sha256 beside the backup: record one at backup time"; fi

echo "2/5 Creating the isolated target database"
mysql --host="$HOST" --port="$PORT" --user="$USER" -e "DROP DATABASE IF EXISTS \`${DATABASE}\`; CREATE DATABASE \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "3/5 Restoring"
START=$(date +%s)
decrypt() {
  if [[ "$FILE" == *.age ]]; then
    age --decrypt --identity "$IDENTITY" "$FILE"
  elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
    gpg --batch --quiet --decrypt --passphrase-fd 3 "$FILE" 3<<<"$BACKUP_PASSPHRASE"
  else
    gpg --batch --quiet --decrypt "$FILE"
  fi
}
decrypt | gunzip | mysql --host="$HOST" --port="$PORT" --user="$USER" "$DATABASE"
END=$(date +%s)

echo "4/5 Verifying schema and content"
mysql --host="$HOST" --port="$PORT" --user="$USER" "$DATABASE" -N -e "
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
cat <<'NOTES'
  Still to do by hand, and to record in the drill report:
    - replay privacy deletion records made after the backup point
    - verify media checksums against object storage
    - rebuild caches and queues from the restored rows (the outbox is authoritative)
    - confirm outbound mail is disabled in the isolated environment before starting any worker
    - measure the gap between the backup point and now: that is the RPO for this drill
NOTES
