#!/usr/bin/env bash
# Where the application's database actually is, taken from the URL the
# application itself uses (SRS BACK 001).
#
#   . infrastructure/backup/db-target.sh
#   read -r DB_HOST DB_PORT DB_NAME <<<"$(db_target_from_env_file /srv/adelaide-sphere/shared/api.env)"
#
# Assuming 127.0.0.1:3306 backs up whatever answers on the default port, which
# on a host that also runs another MySQL is a different server — the backup then
# fails to authenticate, or silently dumps the wrong database. This file is the
# single copy of that reasoning: the deployment script and the scheduled backup
# both source it, so the two can never drift apart again.
#
# Sourced, not executed: it defines two functions and prints nothing by itself.

# One value from an env file, read the way systemd reads EnvironmentFile.
#
# Deliberately NOT `set -a; . file`. These files hold a DATABASE_URL whose query
# string contains an unquoted `&` (`?sslmode=verify-ca&sslca=…`), and to a shell
# that `&` is "run the assignment in the background": sourcing such a file leaves
# DATABASE_URL *unset* while every other variable in the file loads normally.
# systemd parses the file itself, so the services never saw it — only shells did.
# Reading rather than sourcing also means an env file can never execute code.
env_file_value() (
  set -Eeuo pipefail
  [ -r "${1:-}" ] || { echo "env_file_value: cannot read ${1:-<no file>}" >&2; exit 1; }
  [ -n "${2:-}" ] || { echo 'env_file_value: no key given.' >&2; exit 1; }
  ENV_FILE_KEY="$2" awk '
    index($0, ENVIRON["ENV_FILE_KEY"] "=") == 1 {
      value = substr($0, length(ENVIRON["ENV_FILE_KEY"]) + 2)
      sub(/\r$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value = substr(value, 2, length(value) - 2)
      last = value; found = 1      # last assignment wins, as systemd does
    }
    END { if (found) print last }
  ' "$1"
)

# Prints "<host> <port> <database>" for the DATABASE_URL in the given env file.
db_target_from_env_file() (
  set -Eeuo pipefail
  command -v node >/dev/null 2>&1 || { echo 'db_target_from_env_file: node is not on PATH.' >&2; exit 1; }
  url=$(env_file_value "$1" DATABASE_URL)
  [ -n "$url" ] || { echo "db_target_from_env_file: no DATABASE_URL in $1" >&2; exit 1; }
  # Passed in the environment, never on the command line: the URL holds a password.
  DATABASE_URL="$url" node --input-type=module <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!database) { console.error('DATABASE_URL has no database name.'); process.exit(1); }
process.stdout.write(`${url.hostname} ${url.port || '3306'} ${database}`);
NODE
)
