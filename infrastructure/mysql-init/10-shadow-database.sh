#!/bin/bash
# Runs ONCE, on first initialisation of an empty MySQL data volume
# (docker-entrypoint-initdb.d). Creates the Prisma Migrate shadow database and
# the automated-test database, and grants the application user privileges on
# those two databases only, so `prisma migrate dev` and the integration tests
# run as the non-root application user without CREATE DATABASE rights.
# Existing volumes: apply the same statements manually as root (see
# infrastructure/README.md, "Shadow and test databases").
set -euo pipefail
SHADOW_DB="${MYSQL_DATABASE}_shadow"
TEST_DB="${MYSQL_DATABASE%_dev}_test"
mysql --user=root --password="${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${SHADOW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${SHADOW_DB}\`.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
echo "[init] databases ${SHADOW_DB} and ${TEST_DB} created and granted to ${MYSQL_USER}"
