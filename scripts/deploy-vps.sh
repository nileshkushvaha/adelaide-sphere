#!/usr/bin/env bash
# Run as deploy on the existing Ubuntu VPS. Optional argument: branch or commit.
set -Eeuo pipefail
umask 027
ROOT=/srv/adelaide-sphere
REF=${1:-master}
[[ $# -le 1 && "$REF" != -* ]] || { echo 'Usage: bash deploy-vps.sh [branch-or-commit]' >&2; exit 2; }
[[ $(id -un) == deploy ]] || { echo 'Run as deploy, not root.' >&2; exit 1; }
for tool in git flock curl sudo gzip; do command -v "$tool" >/dev/null || { echo "Required command not found: $tool" >&2; exit 1; }; done
exec 9>"$ROOT/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ -L "$ROOT/current" ]] || { echo 'Expected current to be a release symlink.' >&2; exit 1; }
PREVIOUS=$(readlink -f "$ROOT/current")
[[ "$PREVIOUS" == "$ROOT/releases/"* && -d "$PREVIOUS" ]]
# Named one by one: `set -e` on a bare `test` ends the deployment with no
# output at all, which reads as "nothing happened" rather than "this is missing".
for env in api web worker backup; do
  test -r "$ROOT/shared/$env.env" || { echo "Missing or unreadable: $ROOT/shared/$env.env" >&2; exit 1; }
done
test -r "$ROOT/shared/backup-recipient.txt" || { echo "Missing or unreadable: $ROOT/shared/backup-recipient.txt" >&2; exit 1; }
sudo -v
sudo nginx -t
for service in adelaide-sphere-api adelaide-sphere-worker adelaide-sphere-web; do sudo systemctl is-active --quiet "$service"; done

git --git-dir="$ROOT/repo.git" fetch origin
SHA=$(git --git-dir="$ROOT/repo.git" rev-parse --verify "$REF^{commit}")
# Always build in a fresh directory, including when retrying the same commit.
DIR=$(mktemp -d "$ROOT/releases/${SHA:0:12}-XXXXXXXX")
rmdir "$DIR"
git --git-dir="$ROOT/repo.git" worktree add --detach "$DIR" "$SHA"
cd "$DIR"
export NVM_DIR=/home/deploy/.nvm
set +u
. "$NVM_DIR/nvm.sh"
nvm use
set -u
EXPECTED_PNPM=$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')
[[ $(pnpm --version) == "$EXPECTED_PNPM" ]] || { echo "Install pnpm@$EXPECTED_PNPM for this Node version first." >&2; exit 1; }

api_command() (
  set -a
  . "$ROOT/shared/api.env"
  set +a
  # The application driver uses sslca/sslmode; Prisma CLI uses sslcert/sslaccept.
  # Translate only this subprocess, leaving the shared application URL intact.
  DATABASE_URL=$(node --input-type=module - "$ROOT/shared/mysql-ca.pem" <<'NODE'
import { accessSync, constants } from 'node:fs';
try {
  const url = new URL(process.env.DATABASE_URL);
  const ca = url.searchParams.get('sslca') || url.searchParams.get('sslcert') || process.argv[2];
  accessSync(ca, constants.R_OK);
  url.searchParams.set('sslcert', ca);
  // `strict` verifies the certificate against the authority *and* checks that
  // it names the host. A database reached by IP — the container on loopback —
  // cannot pass the second test: MySQL generates its own certificate, which
  // names neither the host nor 127.0.0.1, which is why the application uses
  // sslmode=verify-ca. The Prisma CLI has no CA-only mode, so on an IP the
  // identity check is the part that is dropped; the connection is still TLS
  // and never leaves the machine. A database reached by name is verified in
  // full.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const byIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || (host.includes(':') && /^[0-9a-fA-F:]+$/.test(host));
  url.searchParams.set('sslaccept', byIp ? 'accept_invalid_certs' : 'strict');
  process.stdout.write(url.toString());
} catch {
  console.error('Cannot prepare Prisma TLS URL. Check DATABASE_URL and the readable MySQL CA file.');
  process.exit(1);
}
NODE
  )
  export DATABASE_URL
  "$@"
)

printf '\nBuilding release %s; current website remains running.\n' "$SHA"
pnpm install --frozen-lockfile
api_command pnpm db:build
pnpm domain:build
pnpm mail:build
pnpm db:migrations:check
pnpm --filter api build
pnpm --filter worker build
(
  set -a
  if [[ -r "$ROOT/shared/admin.env" ]]; then . "$ROOT/shared/admin.env"; fi
  set +a
  pnpm --filter admin build
)
(
  set -a
  . "$ROOT/shared/web.env"
  set +a
  : "${MEDIA_PUBLIC_BASE_URL:?Missing media public URL in web.env}"
  pnpm --filter web build
)
printf '%s\n' "$SHA" > "$DIR/REVISION"
# Only the static admin output needs group read; shared secrets stay untouched.
chgrp www-data "$DIR" "$DIR/apps" "$DIR/apps/admin"
chmod g+rx "$DIR" "$DIR/apps" "$DIR/apps/admin"
chgrp -R www-data "$DIR/apps/admin/dist"
find "$DIR/apps/admin/dist" -type d -exec chmod 750 {} +
find "$DIR/apps/admin/dist" -type f -exec chmod 640 {} +
sudo -u www-data test -r "$DIR/apps/admin/dist/index.html"

sudo -v
# Encrypted backup immediately before the schema changes (SRS BACK 001), with
# the same script and account as the daily job, so the file is restorable by
# the documented drill. Nothing is migrated unless this succeeds.
BACKUP_DIR="$ROOT/backups/before-deploy"
mkdir -p "$BACKUP_DIR"
BACKUP_LOG=$(mktemp)
# Where the database actually is, taken from the URL the application itself
# uses: assuming 127.0.0.1:3306 backs up whatever answers on the default port,
# which on a host that also runs another MySQL is a different server — the
# backup then fails to authenticate, or silently dumps the wrong database.
DB_TARGET=$(
  set -a
  . "$ROOT/shared/api.env"
  set +a
  node --input-type=module <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!database) { console.error('DATABASE_URL has no database name.'); process.exit(1); }
process.stdout.write(`${url.hostname} ${url.port || '3306'} ${database}`);
NODE
)
read -r DB_HOST DB_PORT DB_NAME <<<"$DB_TARGET"
[[ -n "$DB_HOST" && -n "$DB_PORT" && -n "$DB_NAME" ]] || { echo 'Could not read the database host, port and name from DATABASE_URL.' >&2; exit 1; }
printf 'Backing up %s from %s:%s\n' "$DB_NAME" "$DB_HOST" "$DB_PORT"
(
  umask 077
  set -a
  . "$ROOT/shared/backup.env"
  set +a
  export MYSQL_PWD="$MYSQL_BACKUP_PASSWORD"
  "$DIR/infrastructure/backup/backup-database.sh" \
    --host "$DB_HOST" --port "$DB_PORT" --user adelaide_sphere_backup --database "$DB_NAME" \
    --out "$BACKUP_DIR" --recipient "$(cat "$ROOT/shared/backup-recipient.txt")"
) | tee "$BACKUP_LOG"
BACKUP=$(ls -t "$BACKUP_DIR"/*.age "$BACKUP_DIR"/*.gpg 2>/dev/null | head -1 || true)
rm -f "$BACKUP_LOG"
[[ -n "$BACKUP" && -s "$BACKUP" ]] || { echo 'Pre-deploy backup was not written; nothing was migrated.' >&2; exit 1; }
# Keep the twenty most recent pre-deploy backups (the daily job keeps its own 30 days).
ls -t "$BACKUP_DIR"/* 2>/dev/null | tail -n +21 | xargs -r rm -f

# Apply reviewed migrations while the previous release is still serving.
# Migrations are additive (policy checked above), so the running code keeps
# working on the new schema; a failure here stops before anything switches.
api_command pnpm db:migrate:deploy
api_command pnpm db:migrate:status
# Permission codes live in code, not migrations: register new ones, carry the
# grants of codes they replace, and give Super Admin every active permission
# (idempotent). Without this a release that adds permissions hides its screens
# from everyone, Super Admin included. Uses the application's database URL,
# not the Prisma CLI one api_command prepares.
(
  set -a
  . "$ROOT/shared/api.env"
  set +a
  cd "$DIR/apps/api"
  node dist/cli/bootstrap-admin.js --seed-only
)

wait_url() {
  local url=$1
  for ((attempt=0; attempt<30; attempt++)); do
    if curl --connect-timeout 2 --max-time 5 -fsS -o /dev/null "$url"; then return 0; fi
    sleep 2
  done
  return 1
}
switch_link() {
  ln -s "$1" "$ROOT/.current-deploy-$$"
  mv -Tf "$ROOT/.current-deploy-$$" "$ROOT/current"
}
restart_apps() {
  sudo systemctl restart adelaide-sphere-api
  wait_url http://127.0.0.1:4001/api/v1/health/ready
  sudo systemctl restart adelaide-sphere-worker
  wait_url http://127.0.0.1:9474/health
  sudo systemctl restart adelaide-sphere-web
  wait_url http://127.0.0.1:4000/robots.txt
  wait_url http://127.0.0.1:4000/
  for service in adelaide-sphere-api adelaide-sphere-worker adelaide-sphere-web; do sudo systemctl is-active --quiet "$service"; done
}
rollback() {
  trap - ERR INT TERM
  set +e
  echo 'Deployment failed after switching; restoring previous release.' >&2
  switch_link "$PREVIOUS"
  # Use a fresh strict subprocess so a failed recovery cannot report success.
  ( set -e; restart_apps )
  if [[ $? == 0 ]]; then
    echo "Previous release restored: $PREVIOUS" >&2
  else
    echo 'Recovery needs attention. Check systemctl status adelaide-sphere-api adelaide-sphere-worker adelaide-sphere-web.' >&2
  fi
  exit 1
}
printf '%s\n' "$PREVIOUS" > "$ROOT/previous-release"
# The version the Workers card and error reports show.
sudo -u adelaide-sphere sed -i '/^APP_VERSION=/d' "$ROOT/shared/worker.env"
printf 'APP_VERSION=%s\n' "$SHA" | sudo -u adelaide-sphere tee -a "$ROOT/shared/worker.env" >/dev/null
trap rollback ERR INT TERM
switch_link "$DIR"
restart_apps
# Verify this VPS directly, even when Cloudflare proxies the public hostname.
for path in / /admin/ /api/v1/health/ready; do
  curl --resolve adelaidesphere.com:443:127.0.0.1 \
    --connect-timeout 3 --max-time 15 -fsS -o /dev/null "https://adelaidesphere.com$path"
done
trap - ERR INT TERM
printf '\nDeployment successful: %s\nPrevious release: %s\nDatabase backup: %s\n' "$SHA" "$PREVIOUS" "$BACKUP"
