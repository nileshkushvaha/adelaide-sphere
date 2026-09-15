# Deploying Melbourne Sphere to a single VPS

A complete, ordered procedure for putting the whole product on one Ubuntu
server: first installation, first release, content, TLS, backups, monitoring,
routine updates and rollback. Every command below matches a file in this
repository; where the repository leaves a choice to the client (provider
accounts, domain, on-call), the step says so.

Read `docs/operations/runbook.md` alongside this guide. It holds the rules this
procedure implements (environments, health, backups, alerts). This guide is the
"how, on one machine" version.

> **Conventions.** `melbournesphere.com` is the production domain
> (`PUBLIC_SITE_URL` / `SITE_ORIGIN` in the example files). Replace it, and
> `media.melbournesphere.com`, if yours differ. Commands prefixed with `sudo`
> run as your administrative user; everything else runs as the `ms` service
> user unless the step says otherwise. `<…>` marks a value you supply. Never
> paste a real secret into a tracked file, a ticket or a chat.

---

## 0. What runs where

```
                 Internet (443 only)
                        │
                 ┌──────┴───────┐
                 │  nginx (host) │  TLS (Let's Encrypt), routing, 404 document
                 └──┬───┬───┬───┬┘
   /api/v1/*  ──────┘   │   │   └────── media.melbournesphere.com
   /admin/*  (static) ──┘   │                       │
   /*          ─────────────┘                       │
        │           │                               │
  ms-api :3001  ms-web :3000                 MinIO :9000 (Docker)
  (systemd)     (systemd)                           │
        │                                           │
  ms-worker (systemd, no port; metrics on 127.0.0.1:9464)
        │
  MySQL 8.4 :3306 · Redis 8.4 :6379   (Docker, 127.0.0.1 only)
```

| Component | How it runs | Listens on | Notes |
| --- | --- | --- | --- |
| Public site (`apps/web`, Next.js 16) | systemd `ms-web` | `127.0.0.1:3000` | Server-rendered; talks to the API over loopback |
| API (`apps/api`, NestJS 12) | systemd `ms-api` | `:3001` (firewalled) | `/api/v1`, health, `/metrics` |
| Worker (`apps/worker`, BullMQ) | systemd `ms-worker` | `127.0.0.1:9464` (metrics/health) | **Required.** Without it images never process, enquiries are never sent, scheduled posts never publish and caches never purge |
| Admin (`apps/admin`, Vite build) | static files served by nginx | — | Served at `/admin/` |
| MySQL 8.4.11 | Docker | `127.0.0.1:3306` | TLS, binlogs on |
| Redis 8.4.6 | Docker | `127.0.0.1:6379` | Password, AOF, `noeviction` (BullMQ requires it) |
| MinIO (S3) | Docker | `127.0.0.1:9000` | Public through `media.` host (browser uploads + image delivery) |
| nginx 1.24+ | apt | `:80`, `:443` | The only public listener besides SSH |

**Why systemd for the apps and Docker only for the data services.** The
application Dockerfiles (`apps/{api,worker,web}/Dockerfile`) exist but have not
been proven end-to-end on a server; building on the host with the pinned Node
and pnpm is the path this project actually runs. The data services use the
same pinned images as local development. Moving the apps into containers later
is a straight swap of section 9.

**Sizing.** Minimum 4 vCPU, 8 GB RAM, 80 GB SSD (image processing with `sharp`
and the Next.js build are the heavy parts). Choose an Australian region
(runbook §1).

---

## 1. Before you start — decisions and accounts

Collect these first; several steps cannot complete without them.

| Item | Needed for | Where it goes |
| --- | --- | --- |
| Domain with DNS access | TLS, canonical URLs | Section 2 |
| VPS with Ubuntu Server 24.04 LTS, root or sudo SSH access | Everything | Section 3 |
| Cloudflare Turnstile widget (site key + secret key), hostname `melbournesphere.com` | Review, contact and enquiry forms | `TURNSTILE_SITE_KEY` (web), `TURNSTILE_SECRET_KEY` (api) |
| Resend account with a **verified sending domain** (e.g. `mail.melbournesphere.com`), API key, webhook signing secret | Password resets, enquiry delivery | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM_ADDRESS` (see `email-deliverability.md`). An authenticated TLS SMTP relay also works (`MAIL_TRANSPORT=smtp`) |
| Mailbox that receives general site enquiries | `/contact` | `SITE_ENQUIRY_RECIPIENT` |
| The first administrator's email and name | Admin bootstrap | Section 11 |
| An `age` key pair for backup encryption, private key kept **off** the server | Backups | Section 15 |
| Off-site storage for backups (a second provider/bucket) | Backups | Section 15 |
| Git access to `github.com:nileshkushvaha/melbourne-sphere` (a read-only deploy key) | Fetching releases | Section 7 |

---

## 2. DNS

Create these records at your DNS provider (TTL 300 while setting up):

| Type | Name | Value |
| --- | --- | --- |
| A | `melbournesphere.com` | `<VPS IPv4>` |
| A | `www.melbournesphere.com` | `<VPS IPv4>` |
| A | `media.melbournesphere.com` | `<VPS IPv4>` |
| AAAA | same three names | `<VPS IPv6>` (only if the VPS has one and you open IPv6 in the firewall) |

Plus the email records Resend gives you (SPF, DKIM, DMARC `p=none` to start) on
the sending subdomain — `email-deliverability.md` §"Domain set-up".

Check before continuing (from your laptop):

```bash
dig +short melbournesphere.com
```

```bash
dig +short media.melbournesphere.com
```

Both must print the VPS address; Let's Encrypt fails otherwise.

---

## 3. Prepare the server

### 3.1 First login, updates, time

```bash
ssh root@<VPS IPv4>
```

```bash
apt update && apt full-upgrade -y && reboot
```

Log back in, then:

```bash
timedatectl set-timezone Australia/Melbourne
```

```bash
hostnamectl set-hostname ms-prod-1
```

### 3.2 An administrative user, key-only SSH

On the server (replace `deploy` with your name if you prefer):

```bash
adduser deploy
```

```bash
usermod -aG sudo deploy
```

```bash
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **second** terminal and confirm `ssh deploy@<VPS IPv4>` works and
`sudo -v` succeeds. Only then harden SSH:

```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
```

```bash
sudo systemctl restart ssh
```

### 3.3 Firewall, brute-force protection, automatic security updates

```bash
sudo apt install -y ufw fail2ban unattended-upgrades
```

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing && sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

```bash
sudo systemctl enable --now fail2ban
```

**Cloudflare proxies the site**, so once DNS is proxied (section 2) only
Cloudflare should reach ports 80 and 443. Otherwise anyone who finds the server's
address can go around Cloudflare. Section 9.2 installs a script that allows only
Cloudflare's published ranges and removes the open rules above.

Docker publishes ports by writing its own iptables rules, **bypassing ufw**.
That is why every container port in section 6 is bound to `127.0.0.1` — never
change those bindings to a bare port.

### 3.4 Swap (keeps the Next.js build from being OOM-killed on 8 GB)

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Install the software

### 4.1 Base packages

```bash
sudo apt install -y git curl ca-certificates gnupg build-essential jq nginx certbot python3-certbot-nginx age
```

### 4.2 Docker Engine and the Compose plugin (official repository)

```bash
sudo install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg && sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
```

```bash
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

```bash
docker --version && docker compose version
```

Cap container logs so they cannot fill the disk:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{ "log-driver": "local", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
```

```bash
sudo systemctl restart docker
```

### 4.3 Node.js 24.19.0 exactly (the version in `.nvmrc`)

Installed system-wide from the official tarball so systemd, cron and every user
see the same binary:

```bash
cd /tmp && ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/') && curl -fsSLO https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-$ARCH.tar.xz && curl -fsSL https://nodejs.org/dist/v24.19.0/SHASUMS256.txt | grep "linux-$ARCH.tar.xz" | sha256sum -c -
```

```bash
sudo mkdir -p /opt/node && sudo tar -xJf /tmp/node-v24.19.0-linux-*.tar.xz -C /opt/node --strip-components=1 && sudo ln -sf /opt/node/bin/node /usr/local/bin/node && sudo ln -sf /opt/node/bin/npm /usr/local/bin/npm && sudo ln -sf /opt/node/bin/npx /usr/local/bin/npx && sudo ln -sf /opt/node/bin/corepack /usr/local/bin/corepack
```

### 4.4 pnpm 12.3.4 (the version in `packageManager`)

```bash
sudo corepack enable --install-directory /usr/local/bin && sudo corepack prepare pnpm@12.3.4 --activate
```

```bash
node --version && pnpm --version
```

Expected: `v24.19.0` and `12.3.4`.

### 4.5 MySQL 8.4 client tools (for backups and restore drills)

Ubuntu's own `mysql-client` is 8.0; the backup script should use the 8.4 client
that matches the server. Use the client from the running container instead of
installing one — section 15 does exactly that — or install `mysql-client` from
the MySQL APT repository with the 8.4 LTS track selected.

---

## 5. Service user and directory layout

```bash
sudo adduser --system --group --home /srv/adelaide-sphere --shell /bin/bash ms
```

```bash
sudo usermod -aG docker ms
```

```bash
sudo -u ms mkdir -p /srv/adelaide-sphere/{releases,shared,services,backups,logs}
```

```bash
sudo chmod 750 /srv/adelaide-sphere && sudo chmod 700 /srv/adelaide-sphere/shared /srv/adelaide-sphere/backups
```

| Path | Holds |
| --- | --- |
| `/srv/adelaide-sphere/releases/<git-sha>/` | One checked-out, built release per deploy |
| `/srv/adelaide-sphere/current` | Symlink to the live release (systemd and nginx use this) |
| `/srv/adelaide-sphere/shared/` | Environment files, MySQL CA, anything that survives releases (mode 700) |
| `/srv/adelaide-sphere/services/` | Compose file and `.env` for MySQL, Redis, MinIO |
| `/srv/adelaide-sphere/backups/` | Encrypted local backup copies before off-site upload |

Become the service user for the next sections:

```bash
sudo -iu ms
```

---

## 6. Data services: MySQL, Redis, MinIO

### 6.1 Secrets for the services

Generate hex secrets (no characters that need URL-encoding later):

```bash
cd /srv/adelaide-sphere/services && umask 077 && cat > .env <<EOF
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 32)
MYSQL_DATABASE=melbourne_sphere
MYSQL_USER=ms_app
MYSQL_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
MINIO_ROOT_USER=ms-minio-root
MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
EOF
```

```bash
chmod 600 .env
```

Store a copy of these values in your password manager now. They are consumed
by MySQL **only on the first start of an empty volume** (see
`infrastructure/README.md`, "first-start-only").

### 6.2 MySQL configuration (binlogs for point-in-time recovery, collation)

```bash
mkdir -p /srv/adelaide-sphere/services/mysql-conf && cat > /srv/adelaide-sphere/services/mysql-conf/ms.cnf <<'EOF'
[mysqld]
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
log_bin = mysql-bin
binlog_expire_logs_seconds = 604800
max_connections = 200
innodb_buffer_pool_size = 1G
require_secure_transport = OFF
EOF
```

(`require_secure_transport` stays off so the in-container health check and the
backup client over the socket work; the API and worker still refuse to connect
without verified TLS.)

### 6.3 The production Compose file

```bash
cat > /srv/adelaide-sphere/services/docker-compose.yml <<'EOF'
name: adelaide-sphere-prod

services:
  mysql:
    image: mysql:8.4.11
    container_name: ms-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?}
      MYSQL_DATABASE: ${MYSQL_DATABASE:?}
      MYSQL_USER: ${MYSQL_USER:?}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?}
    volumes:
      - mysql-data:/var/lib/mysql
      - ./mysql-conf:/etc/mysql/conf.d:ro
    ports:
      - "127.0.0.1:3306:3306"
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p\"$$MYSQL_ROOT_PASSWORD\" --silent"]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 60s

  redis:
    image: redis:8.4.6
    container_name: ms-redis
    restart: unless-stopped
    command:
      - redis-server
      - --requirepass
      - ${REDIS_PASSWORD:?}
      - --appendonly
      - "yes"
      - --appendfsync
      - everysec
      - --save
      - "60 1000"
      - --maxmemory-policy
      - noeviction
    environment:
      REDISCLI_AUTH: ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    container_name: ms-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:?}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?}
      # Browsers upload straight to the quarantine bucket with a signed URL
      # issued by the API, so the admin origin must be allowed.
      MINIO_API_CORS_ALLOW_ORIGIN: https://melbournesphere.com
    volumes:
      - minio-data:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 3s
      retries: 20

volumes:
  mysql-data:
  redis-data:
  minio-data:
EOF
```

### 6.4 Start and check

```bash
cd /srv/adelaide-sphere/services && docker compose --env-file .env config --quiet && docker compose --env-file .env up -d --wait
```

```bash
docker compose --env-file .env ps
```

All three must show `healthy`. Confirm nothing is exposed publicly:

```bash
sudo ss -ltnp | grep -E ':(3306|6379|9000|9001)\b'
```

Every line must show `127.0.0.1`.

### 6.5 MySQL TLS certificate authority for the application

MySQL 8.4 generates a CA and server certificate in its data directory on first
start. The API and worker verify the server against that CA
(`sslmode=verify-ca`; `verify-identity` would fail because the generated
certificate does not name `127.0.0.1`).

```bash
docker cp ms-mysql:/var/lib/mysql/ca.pem /srv/adelaide-sphere/shared/mysql-ca.pem && chmod 644 /srv/adelaide-sphere/shared/mysql-ca.pem
```

Confirm TLS is on:

```bash
cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && docker exec -e MYSQL_PWD="$MYSQL_PASSWORD" ms-mysql mysql -h 127.0.0.1 -u"$MYSQL_USER" --ssl-mode=REQUIRED -e "SHOW STATUS LIKE 'Ssl_cipher'"
```

A non-empty cipher means the connection is encrypted.

### 6.6 A separate backup account (least privilege)

```bash
cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && BACKUP_PW=$(openssl rand -hex 32) && echo "MYSQL_BACKUP_PASSWORD=$BACKUP_PW" >> /srv/adelaide-sphere/shared/backup.env && chmod 600 /srv/adelaide-sphere/shared/backup.env && docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" ms-mysql mysql -uroot <<SQL
CREATE USER IF NOT EXISTS 'ms_backup'@'%' IDENTIFIED BY '$BACKUP_PW';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT, PROCESS, RELOAD, REPLICATION CLIENT ON *.* TO 'ms_backup'@'%';
FLUSH PRIVILEGES;
SQL
```

### 6.7 A least-privilege MinIO key for the application

The application must not use the MinIO root credentials.

```bash
cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && docker exec ms-minio mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
```

```bash
docker exec ms-minio mc mb --ignore-existing local/adelaide-sphere-quarantine && docker exec ms-minio mc mb --ignore-existing local/adelaide-sphere-media && docker exec ms-minio mc anonymous set download local/adelaide-sphere-media
```

(The public bucket is anonymously **readable**; the quarantine bucket is never
public. The API also applies this read policy at start-up if it can.)

```bash
docker exec -i ms-minio sh -c 'cat > /tmp/ms-app-policy.json' <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketPolicy", "s3:PutBucketPolicy"],
      "Resource": ["arn:aws:s3:::adelaide-sphere-quarantine", "arn:aws:s3:::adelaide-sphere-media"] },
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::adelaide-sphere-quarantine/*", "arn:aws:s3:::adelaide-sphere-media/*"] }
  ]
}
EOF
```

```bash
docker exec ms-minio mc admin policy create local ms-app /tmp/ms-app-policy.json && APP_KEY=ms-app && APP_SECRET=$(openssl rand -hex 32) && docker exec ms-minio mc admin user add local "$APP_KEY" "$APP_SECRET" && docker exec ms-minio mc admin policy attach local ms-app --user "$APP_KEY" && printf 'MEDIA_S3_ACCESS_KEY_ID=%s\nMEDIA_S3_SECRET_ACCESS_KEY=%s\n' "$APP_KEY" "$APP_SECRET" > /srv/adelaide-sphere/shared/minio-app.env && chmod 600 /srv/adelaide-sphere/shared/minio-app.env
```

Turn on versioning for the media bucket (runbook §4, media recovery):

```bash
docker exec ms-minio mc version enable local/adelaide-sphere-media
```

---

## 7. Fetch the code

### 7.1 A read-only deploy key

```bash
ssh-keygen -t ed25519 -N '' -C 'ms-prod-1 deploy key' -f ~/.ssh/ms_deploy && cat ~/.ssh/ms_deploy.pub
```

Add the printed public key in GitHub → repository → Settings → Deploy keys,
**without** write access. Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/ms_deploy
  IdentitiesOnly yes
EOF
```

```bash
chmod 600 ~/.ssh/config && ssh-keyscan github.com >> ~/.ssh/known_hosts && ssh -T git@github.com
```

(GitHub answers "successfully authenticated … does not provide shell access".)

### 7.2 A mirror, then one directory per release

```bash
git clone --mirror git@github.com:nileshkushvaha/melbourne-sphere.git /srv/adelaide-sphere/repo.git
```

```bash
cd /srv/adelaide-sphere/repo.git && git fetch --prune origin && SHA=$(git rev-parse master) && echo $SHA
```

```bash
git --git-dir=/srv/adelaide-sphere/repo.git worktree add --detach /srv/adelaide-sphere/releases/$SHA $SHA
```

Keep `$SHA` in your shell for the next sections (or re-read it with the second
command above).

---

## 8. Environment files

Three files in `/srv/adelaide-sphere/shared/`, mode 600, owned by `ms`. They
are the production equivalents of `apps/api/.env.example`,
`apps/worker/.env.example` and `apps/web/.env.example`; read those for what each
variable means.

### 8.1 Generate the application secrets

```bash
cd /srv/adelaide-sphere/shared && umask 077 && printf 'APP_SECRET_KEY=%s\nFIELD_ENCRYPTION_KEY=%s\nREVALIDATE_TOKEN=%s\nMETRICS_TOKEN=%s\n' "$(openssl rand -hex 48)" "$(openssl rand -base64 32)" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > generated.env && cat generated.env
```

Put these four values in your password manager too. **`FIELD_ENCRYPTION_KEY`
can never be changed casually**: it encrypts stored two-factor secrets and
private fields. Losing it loses that data.

### 8.2 `api.env` — read by the API, the worker and every CLI command

```bash
cd /srv/adelaide-sphere/shared && . ../services/.env && . ./generated.env && . ./minio-app.env && cat > api.env <<EOF
NODE_ENV=production
PORT=3001
TRUST_PROXY=1

DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DATABASE}?sslmode=verify-ca&sslca=%2Fsrv%2Fmelbourne-sphere%2Fshared%2Fmysql-ca.pem
DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL=false
DATABASE_CONNECTION_LIMIT=20

REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:6379/0

APP_SECRET_KEY=${APP_SECRET_KEY}
FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY}

TRUSTED_ORIGINS=https://melbournesphere.com
SESSION_COOKIE_SECURE=true
SESSION_IDLE_MINUTES=30
SESSION_ABSOLUTE_HOURS=12
PUBLIC_ADMIN_URL=https://melbournesphere.com/admin
PUBLIC_SITE_URL=https://melbournesphere.com
OPENAPI_ENABLED=false

MAIL_TRANSPORT=resend
RESEND_API_KEY=<re_… from Resend>
RESEND_WEBHOOK_SECRET=<whsec_… from Resend>
MAIL_FROM_ADDRESS=<hello@mail.melbournesphere.com>
MAIL_FROM_NAME=Melbourne Sphere
MAIL_REPLY_TO_ADDRESS=<monitored mailbox>
SITE_ENQUIRY_RECIPIENT=<mailbox that receives /contact enquiries>

TURNSTILE_SECRET_KEY=<Turnstile secret key>
SUBMISSION_TERMS_VERSION=2026-09-01

MEDIA_S3_ENDPOINT=https://media.melbournesphere.com
MEDIA_S3_REGION=us-east-1
MEDIA_S3_ACCESS_KEY_ID=${MEDIA_S3_ACCESS_KEY_ID}
MEDIA_S3_SECRET_ACCESS_KEY=${MEDIA_S3_SECRET_ACCESS_KEY}
MEDIA_QUARANTINE_BUCKET=adelaide-sphere-quarantine
MEDIA_PUBLIC_BUCKET=adelaide-sphere-media
MEDIA_PUBLIC_BASE_URL=https://media.melbournesphere.com/adelaide-sphere-media

WORKER_CONCURRENCY=2
METRICS_TOKEN=${METRICS_TOKEN}
EOF
```

```bash
chmod 600 api.env && nano api.env
```

Replace every remaining `<…>` in the editor. Notes that matter:

- **`MEDIA_S3_ENDPOINT` is the public `https://media.` host, not
  `127.0.0.1:9000`.** The API signs upload URLs for that host and the admin
  browser uploads to it directly; a loopback endpoint produces upload URLs no
  browser can reach. The API and worker reach it through nginx on the same
  machine.
- `MAIL_TRANSPORT=smtp` is the alternative to Resend: then set `SMTP_HOST`,
  `SMTP_PORT=587` (or `465` with `SMTP_SECURE=true`), `SMTP_USER`,
  `SMTP_PASSWORD` instead of the `RESEND_*` lines. Production refuses `console`
  and `none`.
- The API refuses to start in production if any of these is wrong: insecure
  cookies, missing Turnstile secret, missing site URL, missing sender, missing
  media credentials or base URL, public-key retrieval on, an unverified database
  URL, or an `http://` trusted origin. That is deliberate; read the error, fix
  the file, restart.

### 8.3 `worker.env` — worker-only additions

```bash
cd /srv/adelaide-sphere/shared && . ./generated.env && cat > worker.env <<EOF
WEB_REVALIDATE_URL=https://melbournesphere.com/api/revalidate
WEB_REVALIDATE_TOKEN=${REVALIDATE_TOKEN}
WORKER_METRICS_PORT=9464
WORKER_METRICS_BIND=127.0.0.1
LOG_LEVEL=info
EOF
```

```bash
chmod 600 worker.env
```

### 8.4 `web.env` — the public site (read at build **and** at runtime)

```bash
cd /srv/adelaide-sphere/shared && . ./generated.env && cat > web.env <<EOF
NODE_ENV=production
PORT=3000
API_ORIGIN=http://127.0.0.1:3001
SITE_ORIGIN=https://melbournesphere.com
TURNSTILE_SITE_KEY=<Turnstile site key>
MEDIA_PUBLIC_BASE_URL=https://media.melbournesphere.com/adelaide-sphere-media
REVALIDATE_TOKEN=${REVALIDATE_TOKEN}
REVIEW_RICH_RESULTS=false
FAQ_RICH_RESULTS=false
EOF
```

```bash
chmod 600 web.env && nano web.env
```

`MEDIA_PUBLIC_BASE_URL` is compiled into the image allow-list during
`next build`. If it is missing at build time, every page that shows an uploaded
image fails. `REVIEW_RICH_RESULTS` stays `false` until
`docs/launch/seo-approval.md` is signed off.

### 8.5 Remove the scratch file

```bash
shred -u /srv/adelaide-sphere/shared/generated.env
```

---

## 9. nginx and TLS (before the first build)

The worker's revalidation URL and the media endpoint both go through nginx, so
nginx comes up before the applications. Leave the `ms` shell (`exit`) — these
steps need `sudo`.

### 9.1 Certificates

```bash
sudo systemctl stop nginx && sudo certbot certonly --standalone -d melbournesphere.com -d www.melbournesphere.com -d media.melbournesphere.com --agree-tos -m <ops email> --no-eff-email && sudo systemctl start nginx
```

Renewal is installed as a systemd timer by the package. Make it reload nginx:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo certbot renew --dry-run
```

### 9.2 Cloudflare real IP, rate limits and security headers

With Cloudflare in front, every connection arrives from a Cloudflare address.
nginx must restore the visitor's address from `CF-Connecting-IP`, but only when
the connection really comes from Cloudflare. Otherwise rate limits, the login
throttle and the audit log would all see a handful of Cloudflare IPs. The API
keeps `TRUST_PROXY=1` and reads the address nginx forwards.

This script writes the trusted ranges for nginx and the firewall, and is safe to
re-run. A weekly timer keeps the ranges current:

```bash
sudo tee /usr/local/sbin/ms-cloudflare-ranges >/dev/null <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
[[ -n "$v4" && -n "$v6" ]] || { echo 'Could not fetch Cloudflare ranges; nothing changed.' >&2; exit 1; }
tmp=$(mktemp)
{
  echo '# Generated by ms-cloudflare-ranges. Do not edit.'
  for range in $v4 $v6; do echo "set_real_ip_from $range;"; done
  echo 'real_ip_header CF-Connecting-IP;'
} > "$tmp"
install -m 644 "$tmp" /etc/nginx/conf.d/ms-cloudflare-realip.conf && rm -f "$tmp"
nginx -t && systemctl reload nginx
# Web ports: Cloudflare only. SSH is untouched.
for port in 80 443; do
  ufw --force delete allow "$port/tcp" >/dev/null 2>&1 || true
  for range in $v4 $v6; do ufw allow proto tcp from "$range" to any port "$port" comment cloudflare >/dev/null; done
done
ufw reload >/dev/null
EOF
sudo chmod 750 /usr/local/sbin/ms-cloudflare-ranges && sudo /usr/local/sbin/ms-cloudflare-ranges
```

```bash
printf '[Unit]\nDescription=Refresh Cloudflare ranges\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/ms-cloudflare-ranges\n' | sudo tee /etc/systemd/system/ms-cloudflare-ranges.service >/dev/null && printf '[Unit]\nDescription=Weekly Cloudflare range refresh\n[Timer]\nOnCalendar=weekly\nPersistent=true\n[Install]\nWantedBy=timers.target\n' | sudo tee /etc/systemd/system/ms-cloudflare-ranges.timer >/dev/null && sudo systemctl daemon-reload && sudo systemctl enable --now ms-cloudflare-ranges.timer
```

Rate limits and compression apply to the whole `http` block. The API has its own
per-form and login limits; these limits stop bulk scraping and floods of search
requests before they reach Node. Only static text types are compressed. Leaving
HTML and JSON uncompressed keeps responses that carry session-bound data out of
reach of compression side channels (BREACH).

```bash
sudo tee /etc/nginx/conf.d/ms-limits.conf >/dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=ms_api:10m    rate=10r/s;
limit_req_zone $binary_remote_addr zone=ms_search:10m rate=2r/s;
limit_req_status 429;
limit_req_log_level warn;

gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/css application/javascript image/svg+xml application/xml application/rss+xml;
EOF
```

Every response gets the same security headers. nginx drops server-level
`add_header` lines inside any `location` that sets its own, so the snippet is
included in each of those locations too.

```bash
sudo tee /etc/nginx/snippets/ms-security-headers.conf >/dev/null <<'EOF'
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
EOF
```

The public site and the admin get different framing and content policies. The
parts that cannot break a page (framing, `base-uri`, plugins, form targets) are
enforced from launch. The full source allowlist starts as **report-only**:
violations appear in the browser console. Once a week of normal use shows none,
rename the header to `Content-Security-Policy`.

```bash
sudo tee /etc/nginx/snippets/ms-csp-site.conf >/dev/null <<'EOF'
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Content-Security-Policy "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://media.melbournesphere.com https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://i.ytimg.com; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com; frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.google.com; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
EOF
sudo tee /etc/nginx/snippets/ms-csp-admin.conf >/dev/null <<'EOF'
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://media.melbournesphere.com; font-src 'self' data:; connect-src 'self' https://media.melbournesphere.com; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
EOF
```

(Ant Design injects its styles at run time, which is why the admin policy needs
`style-src 'unsafe-inline'`. Scripts stay `'self'` only.)

### 9.3 Site configuration

This is `infrastructure/edge/nginx.conf` adapted to a TLS host with the admin
served as static files. The two load-bearing rules from that file are kept
exactly: a web 404 is answered with Next's prerendered not-found document
**without** `=` (status stays 404), and interception is **off** for `/api/v1/`,
`/admin/` and `/_next/`.

```bash
sudo tee /etc/nginx/sites-available/adelaide-sphere >/dev/null <<'EOF'
upstream ms_web { server 127.0.0.1:3000; keepalive 32; }
upstream ms_api { server 127.0.0.1:3001; keepalive 32; }
upstream ms_minio { server 127.0.0.1:9000; keepalive 16; }

map $http_upgrade $connection_upgrade { default upgrade; '' ''; }

server {
  listen 80;
  listen [::]:80;
  server_name melbournesphere.com www.melbournesphere.com media.melbournesphere.com;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name www.melbournesphere.com;
  ssl_certificate     /etc/letsencrypt/live/melbournesphere.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/melbournesphere.com/privkey.pem;
  return 301 https://melbournesphere.com$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name melbournesphere.com;

  ssl_certificate     /etc/letsencrypt/live/melbournesphere.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/melbournesphere.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  include snippets/ms-security-headers.conf;
  include snippets/ms-csp-site.conf;
  server_tokens off;
  client_max_body_size 1m;

  proxy_http_version 1.1;
  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  proxy_set_header X-Forwarded-For   $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade           $http_upgrade;
  proxy_set_header Connection        $connection_upgrade;

  # Metrics are never public (runbook "Metrics").
  location = /metrics { return 404; }

  # The API owns its 404s (JSON envelopes with a requestId).
  location /api/v1/ {
    limit_req zone=ms_api burst=40 nodelay;
    proxy_intercept_errors off;
    proxy_pass http://ms_api;
  }

  # Search is the most expensive public query: a tighter ceiling, both for the
  # page and for the JSON the hero search calls while someone types.
  location /api/v1/search/ {
    limit_req zone=ms_search burst=20 nodelay;
    proxy_intercept_errors off;
    proxy_pass http://ms_api;
  }
  location = /business {
    limit_req zone=ms_search burst=10 nodelay;
    proxy_intercept_errors on;
    error_page 404 @not_found;
    proxy_pass http://ms_web;
  }

  # The admin is a static single-page app built with base /admin/.
  location = /admin { return 301 /admin/; }
  location /admin/ {
    alias /srv/adelaide-sphere/current/apps/admin/dist/;
    try_files $uri $uri/ /admin/index.html;
    include snippets/ms-security-headers.conf;
    include snippets/ms-csp-admin.conf;
    location /admin/assets/ {
      alias /srv/adelaide-sphere/current/apps/admin/dist/assets/;
      expires 1y;
      include snippets/ms-security-headers.conf;
      include snippets/ms-csp-admin.conf;
      add_header Cache-Control "public, max-age=31536000, immutable";
    }
  }
  location = /admin/index.html {
    alias /srv/adelaide-sphere/current/apps/admin/dist/index.html;
    include snippets/ms-security-headers.conf;
    include snippets/ms-csp-admin.conf;
    add_header Cache-Control "no-store";
  }

  # A missing asset stays a missing asset.
  location /_next/ {
    proxy_intercept_errors off;
    proxy_pass http://ms_web;
  }

  # The public site; a 404 is answered with the document Next.js prerendered.
  location / {
    proxy_intercept_errors on;
    error_page 404 @not_found;
    proxy_pass http://ms_web;
  }

  location @not_found {
    internal;
    root /srv/adelaide-sphere/current/apps/web/.next/server/app;
    default_type text/html;
    include snippets/ms-security-headers.conf;
    include snippets/ms-csp-site.conf;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex" always;
    try_files /_not-found.html =404;
  }
}

# Object storage: public reads of processed images and signed browser uploads.
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name media.melbournesphere.com;

  ssl_certificate     /etc/letsencrypt/live/melbournesphere.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/melbournesphere.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  include snippets/ms-security-headers.conf;
  server_tokens off;

  # Images are at most 10 MB and PDF documents 20 MB (MAX_DOCUMENT_BYTES in packages/domain/src/media.ts).
  client_max_body_size 21m;
  proxy_request_buffering off;
  ignore_invalid_headers off;

  # Published PDFs download rather than render, and cannot run anything if a
  # browser opens them anyway (change log 1.16).
  location ~* \.pdf$ {
    include snippets/ms-security-headers.conf;
    add_header Content-Security-Policy "sandbox" always;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass http://ms_minio;
  }

  location / {
    # The signature covers the Host header: pass it unchanged.
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_connect_timeout 300;
    chunked_transfer_encoding off;
    proxy_pass http://ms_minio;
  }
}
EOF
```

```bash
sudo ln -sf /etc/nginx/sites-available/adelaide-sphere /etc/nginx/sites-enabled/adelaide-sphere && sudo rm -f /etc/nginx/sites-enabled/default
```

nginx (user `www-data`) must be able to read the admin build and the not-found
document:

```bash
sudo usermod -aG ms www-data && sudo chmod 750 /srv/adelaide-sphere /srv/adelaide-sphere/releases
```

Do **not** test or reload yet if `/srv/adelaide-sphere/current` does not exist;
`nginx -t` passes regardless, but the site will answer errors until section 12.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Check the media host now (MinIO answers an anonymous bucket listing with
`AccessDenied` XML — that is correct):

```bash
curl -s https://media.melbournesphere.com/adelaide-sphere-quarantine/ | head -c 200
```

---

## 10. Build the first release

Back as the service user:

```bash
sudo -iu ms
```

```bash
SHA=$(git --git-dir=/srv/adelaide-sphere/repo.git rev-parse master) && cd /srv/adelaide-sphere/releases/$SHA
```

### 10.1 Install dependencies (exact lockfile)

```bash
pnpm install --frozen-lockfile
```

### 10.2 Shared packages, then the database client

The order is the one CI and the Dockerfiles use:

```bash
pnpm db:build && pnpm domain:build && pnpm mail:build
```

### 10.3 Apply database migrations (once per release, never from app start-up)

```bash
set -a && . /srv/adelaide-sphere/shared/api.env && set +a && pnpm db:migrations:check && pnpm db:migrate:deploy && pnpm db:migrate:status
```

`db:migrate:status` must end with "Database schema is up to date". The
application driver uses `sslmode`/`sslca`, while the Prisma CLI requires
`sslcert` and `sslaccept=strict`. Supply the readable CA path as `sslcert` for
CLI commands, keeping certificate verification enabled. The deployment script
translates these options in its database-command subprocess only; it does not
modify `shared/api.env`. Never strip TLS options to work around an error.

### 10.4 Build the API, worker and admin

```bash
pnpm --filter api build && pnpm --filter worker build && pnpm --filter admin build
```

### 10.5 Build the public site with its production environment

```bash
( set -a && . /srv/adelaide-sphere/shared/web.env && set +a && pnpm --filter web build )
```

Watch the output for `[next.config] MEDIA_PUBLIC_BASE_URL is not set` — if it
appears, `web.env` was not loaded; fix and rebuild.

### 10.6 Point `current` at the release

```bash
ln -sfn /srv/adelaide-sphere/releases/$SHA /srv/adelaide-sphere/current && echo $SHA > /srv/adelaide-sphere/current/REVISION
```

---

## 11. First-time data

Choose **one** of 11A (an empty production database) or 11B (carry across the
content you prepared locally). Do not run both.

### 11A. Fresh database

All commands as `ms`, from `/srv/adelaide-sphere/current`, with `api.env`
loaded:

```bash
cd /srv/adelaide-sphere/current && set -a && . /srv/adelaide-sphere/shared/api.env && set +a
```

1. Permissions, roles and the first Super Admin. The password is typed at the
   prompt, never on the command line or into history:

   ```bash
   read -rs -p 'Bootstrap password (12+ chars): ' ADMIN_BOOTSTRAP_PASSWORD && echo && export ADMIN_BOOTSTRAP_PASSWORD && ADMIN_BOOTSTRAP_EMAIL=<you@example.com> ADMIN_BOOTSTRAP_DISPLAY_NAME="<Your Name>" pnpm --filter api admin:bootstrap; unset ADMIN_BOOTSTRAP_PASSWORD
   ```

2. Baseline local areas, categories and services (idempotent):

   ```bash
   pnpm --filter api taxonomy:seed
   ```

3. Privacy, terms and review-guidelines pages (idempotent; only adds):

   ```bash
   pnpm --filter api pages:seed
   ```

4. Verify authorization is sound:

   ```bash
   pnpm --filter api authz:verify
   ```

The Wikimedia Commons scripts in `apps/api/scripts/` (`seed-*.ts`) are for
development databases and refuse to run elsewhere. Production content is
entered in the admin.

### 11B. Carry the local content across

Only for the first deployment, before anyone uses production. On your
**development machine**:

```bash
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --set-gtid-purged=OFF --no-tablespaces melbourne_sphere_dev' | gzip > ms-content.sql.gz
```

```bash
docker exec adelaide-sphere-minio sh -c 'rm -rf /tmp/export && mc alias set dev http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror dev/adelaide-sphere-media /tmp/export/media && mc mirror dev/adelaide-sphere-quarantine /tmp/export/quarantine'
```

```bash
docker cp adelaide-sphere-minio:/tmp/export/media ./media && docker cp adelaide-sphere-minio:/tmp/export/quarantine ./quarantine && docker exec adelaide-sphere-minio rm -rf /tmp/export
```

Copy both to the server:

```bash
scp ms-content.sql.gz deploy@<VPS IPv4>:/tmp/ && rsync -a media quarantine deploy@<VPS IPv4>:/tmp/ms-objects/
```

On the **server** (as `deploy`), import into the production database. The
migrations of section 10.3 created the tables, so the import goes into an
emptied database and then migration status is re-checked:

```bash
sudo -iu ms bash -c 'cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" ms-mysql mysql -uroot -e "DROP DATABASE melbourne_sphere; CREATE DATABASE melbourne_sphere CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON melbourne_sphere.* TO \`ms_app\`@\`%\`;"'
```

```bash
gunzip -c /tmp/ms-content.sql.gz | sudo -iu ms bash -c 'cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" ms-mysql mysql -uroot melbourne_sphere'
```

```bash
sudo -iu ms bash -c 'cd /srv/adelaide-sphere/current && set -a && . /srv/adelaide-sphere/shared/api.env && set +a && pnpm db:migrate:status'
```

Upload the objects:

```bash
sudo docker cp /tmp/ms-objects/media ms-minio:/tmp/media && sudo docker cp /tmp/ms-objects/quarantine ms-minio:/tmp/quarantine && sudo docker exec ms-minio sh -c 'mc mirror --overwrite /tmp/media local/adelaide-sphere-media && mc mirror --overwrite /tmp/quarantine local/adelaide-sphere-quarantine && rm -rf /tmp/media /tmp/quarantine'
```

Then:

1. **Sign in with your development administrator**, create your real
   production administrators (Admins screen), and disable the development
   accounts. Development passwords must not survive into production.
2. Configuration → General settings: check the public contact details.
3. Remove the copies: `rm -rf /tmp/ms-content.sql.gz /tmp/ms-objects` on the
   server and delete `ms-content.sql.gz`, `media/`, `quarantine/` locally.

Stored image URLs are built from `MEDIA_PUBLIC_BASE_URL` at read time, so they
switch to the `media.` host automatically.

---

## 12. systemd services

As `deploy` (sudo). Three units, all running as `ms` from `current`.

```bash
sudo tee /etc/systemd/system/ms-api.service >/dev/null <<'EOF'
[Unit]
Description=Melbourne Sphere API
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=ms
Group=ms
WorkingDirectory=/srv/adelaide-sphere/current/apps/api
EnvironmentFile=/srv/adelaide-sphere/shared/api.env
# Backstop: production checks run even if an env file loses NODE_ENV.
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node dist/main.js
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo tee /etc/systemd/system/ms-worker.service >/dev/null <<'EOF'
[Unit]
Description=Melbourne Sphere worker (media, enquiries, schedules, cache purges)
After=network-online.target docker.service ms-api.service
Wants=network-online.target

[Service]
User=ms
Group=ms
WorkingDirectory=/srv/adelaide-sphere/current/apps/worker
EnvironmentFile=/srv/adelaide-sphere/shared/api.env
EnvironmentFile=/srv/adelaide-sphere/shared/worker.env
# Backstop: production checks run even if an env file loses NODE_ENV.
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node dist/main.js
Restart=always
RestartSec=5
# The worker drains in-flight jobs on SIGTERM; give it time.
TimeoutStopSec=60
KillSignal=SIGTERM
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

The worker reports `APP_VERSION` in its heartbeat (shown on the Workers card).
It is written into `worker.env` by the deploy script (section 17); for the first
start set it by hand:

```bash
sudo -iu ms bash -c 'echo "APP_VERSION=$(cat /srv/adelaide-sphere/current/REVISION)" >> /srv/adelaide-sphere/shared/worker.env'
```

```bash
sudo tee /etc/systemd/system/ms-web.service >/dev/null <<'EOF'
[Unit]
Description=Melbourne Sphere public site (Next.js)
After=network-online.target ms-api.service
Wants=network-online.target

[Service]
User=ms
Group=ms
WorkingDirectory=/srv/adelaide-sphere/current/apps/web
EnvironmentFile=/srv/adelaide-sphere/shared/web.env
# Backstop: production checks run even if an env file loses NODE_ENV.
Environment=NODE_ENV=production
ExecStart=/srv/adelaide-sphere/current/apps/web/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

Let `ms` restart its own services without a password (used by the deploy
script):

```bash
echo 'ms ALL=(root) NOPASSWD: /usr/bin/systemctl restart ms-api, /usr/bin/systemctl restart ms-worker, /usr/bin/systemctl restart ms-web, /usr/bin/systemctl is-active ms-api ms-worker ms-web, /usr/bin/systemctl reload nginx' | sudo tee /etc/sudoers.d/ms-deploy && sudo chmod 440 /etc/sudoers.d/ms-deploy && sudo visudo -c
```

Start in dependency order — API, then worker, then web:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now ms-api && sleep 5 && curl -fsS http://127.0.0.1:3001/api/v1/health/ready
```

```bash
sudo systemctl enable --now ms-worker && sleep 5 && curl -fsS -H "Authorization: Bearer $(sudo grep ^METRICS_TOKEN= /srv/adelaide-sphere/shared/api.env | cut -d= -f2)" http://127.0.0.1:9464/health
```

```bash
sudo systemctl enable --now ms-web && sleep 8 && curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/robots.txt
```

```bash
sudo systemctl reload nginx
```

If a service fails, its first log line names the variable at fault (values
are never printed):

```bash
sudo journalctl -u ms-api -n 50 --no-pager
```

The API listens on all interfaces on 3001; ufw (section 3.3) keeps it private.
Confirm from your laptop that `curl -m 5 http://<VPS IPv4>:3001/api/v1/health`
**times out**.

---

## 13. Connect the third-party services

1. **Turnstile** (Cloudflare dashboard): the widget's hostnames list contains
   `melbournesphere.com`. The API checks the hostname against `PUBLIC_SITE_URL`.
2. **Resend**: sending domain shows *Verified*. Add a webhook to
   `https://melbournesphere.com/api/v1/webhooks/email` for all email events; its
   signing secret must equal `RESEND_WEBHOOK_SECRET` (restart `ms-api` and
   `ms-worker` if you changed it).
3. **Admin → Configuration**: General settings (support email, phone, social
   links), SEO settings (default title, description, share image), Home page
   settings (banner slides). Media library uploads must reach *Ready* within a
   minute — that proves the signed upload URL, MinIO CORS, the worker and the
   public bucket all work together.
4. **Google Search Console** (optional but recommended): verify the domain and
   submit `https://melbournesphere.com/sitemap.xml`.

---

## 14. Verify the deployment

Run from your laptop. Every line must match the expectation.

```bash
for path in / /business /about /faqs /contact /blog /business/x-not-real /blog/x-not-real /api/v1/health /api/v1/health/ready /api/v1/does-not-exist /admin/ /_next/static/nope.js /metrics /robots.txt /sitemap.xml; do curl -s -o /dev/null -w "%{http_code} %{size_download} %{content_type} $path\n" "https://melbournesphere.com$path"; done
```

| Path | Expected |
| --- | --- |
| `/`, `/business`, `/about`, `/faqs`, `/contact`, `/blog` | `200`, HTML |
| `/business/x-not-real`, `/blog/x-not-real` | `404` with a **full** HTML body (tens of KB), not 0 bytes |
| `/api/v1/health`, `/api/v1/health/ready` | `200` JSON |
| `/api/v1/does-not-exist` | `404` **JSON** |
| `/admin/` | `200` HTML |
| `/_next/static/nope.js` | small `404`, not the HTML not-found page |
| `/metrics` | `404` |
| `/robots.txt`, `/sitemap.xml` | `200`; robots names the sitemap on `https://melbournesphere.com` |

Also check:

```bash
curl -sI http://melbournesphere.com | head -3 && curl -sI https://www.melbournesphere.com | head -3
```

(both `301` to `https://melbournesphere.com`)

```bash
curl -s https://melbournesphere.com/ | grep -o 'https://media.melbournesphere.com[^"]*' | head -3
```

(image URLs on the media host; open one — it must load)

In a browser:

- [ ] Home page banner, cards and images render; no console errors.
- [ ] Sign in at `/admin/`; the dashboard loads; **System → Queue monitor →
      Workers** shows one worker checking in with the release SHA.
- [ ] Upload an image in the media library → *Ready* within a minute.
- [ ] Edit and publish a small change to a page → visible on the site within a
      minute (cache purge through `/api/revalidate` works).
- [ ] Send the contact form (Turnstile appears) → **Enquiries** shows it,
      delivery becomes *Sent*, and the mail arrives.
- [ ] Request a password reset for your admin → the email arrives.
- [ ] At 320 px width the home page has no horizontal scroll.

---

## 15. Backups

### 15.1 Encryption key (once, on your laptop — never on the server)

```bash
age-keygen -o ms-backup.key
```

Keep `ms-backup.key` in your password manager / offline. Copy only the public
key line (`age1…`) to the server:

```bash
echo 'age1<public key>' | sudo -u ms tee /srv/adelaide-sphere/shared/backup-recipient.txt
```

### 15.2 Daily database backup

`infrastructure/backup/backup-database.sh` expects `mysqldump` on the path. Give
it the one inside the MySQL container through a tiny wrapper, so the client
always matches the 8.4 server:

```bash
sudo tee /usr/local/bin/mysqldump >/dev/null <<'EOF'
#!/bin/sh
exec docker exec -i -e MYSQL_PWD="$MYSQL_PWD" ms-mysql mysqldump "$@"
EOF
```

The restore drill (15.5) calls `mysql` the same way:

```bash
sudo tee /usr/local/bin/mysql >/dev/null <<'EOF'
#!/bin/sh
exec docker exec -i -e MYSQL_PWD="$MYSQL_PWD" ms-mysql mysql "$@"
EOF
```

```bash
sudo chmod 755 /usr/local/bin/mysqldump /usr/local/bin/mysql
```

(A restore drill's backup file is streamed into the container through standard
input, so the `-i` matters.)

Cron job for `ms` (02:30 every day), keeping 30 days locally:

```bash
sudo -iu ms bash -c 'cat > /srv/adelaide-sphere/backup-daily.sh <<"EOF"
#!/usr/bin/env bash
set -Eeuo pipefail
. /srv/adelaide-sphere/shared/backup.env
export MYSQL_PWD="$MYSQL_BACKUP_PASSWORD"
/srv/adelaide-sphere/current/infrastructure/backup/backup-database.sh \
  --host 127.0.0.1 --user ms_backup --database melbourne_sphere \
  --out /srv/adelaide-sphere/backups \
  --recipient "$(cat /srv/adelaide-sphere/shared/backup-recipient.txt)"
find /srv/adelaide-sphere/backups -type f -mtime +30 -delete
EOF
chmod 700 /srv/adelaide-sphere/backup-daily.sh
(crontab -l 2>/dev/null; echo "30 2 * * * /srv/adelaide-sphere/backup-daily.sh >> /srv/adelaide-sphere/logs/backup.log 2>&1") | crontab -'
```

Run it once now and confirm an `.sql.gz.age` file and its `.sha256` appear:

```bash
sudo -iu ms /srv/adelaide-sphere/backup-daily.sh && sudo ls -lh /srv/adelaide-sphere/backups
```

### 15.3 Off-site copy (required — a backup on the same disk is not a backup)

Configure an S3-compatible bucket at a **different provider**, with object lock
or versioning, and credentials that can write but not delete. Then add to the
`ms` crontab (03:15), for example with `rclone`:

```bash
sudo apt install -y rclone && sudo -iu ms rclone config
```

```bash
sudo -iu ms bash -c '(crontab -l; echo "15 3 * * * rclone copy /srv/adelaide-sphere/backups offsite:ms-backups/db --max-age 48h >> /srv/adelaide-sphere/logs/backup.log 2>&1") | crontab -'
```

### 15.4 Media and Redis

- Media: `mc mirror` the `adelaide-sphere-media` bucket to the same off-site
  provider hourly (runbook §4: lag under one hour). Versioning is already on
  (section 6.7).

  Register the off-site bucket inside the MinIO container's client once (the
  credentials are the off-site provider's write-only key):

  ```bash
  read -rs -p 'Off-site secret key: ' OFFSITE_SECRET && echo && docker exec ms-minio mc alias set offsite <https://s3.offsite-provider.example> <offsite access key> "$OFFSITE_SECRET"; unset OFFSITE_SECRET
  ```

  Then mirror hourly from the `ms` crontab:

  ```bash
  sudo -iu ms bash -c '(crontab -l; echo "5 * * * * docker exec ms-minio mc mirror --overwrite local/adelaide-sphere-media offsite/ms-backups-media >> /srv/adelaide-sphere/logs/backup.log 2>&1") | crontab -'
  ```

  The alias lives in the container's filesystem: repeat the `alias set` step if
  the MinIO container is ever re-created.
- Redis needs no separate backup: it holds sessions, cache and queue state, and
  the database outbox is the recovery source for queued work.

### 15.5 Restore drill (before launch, then quarterly)

On the server, into an isolated `_restore` database (the script refuses any
other name):

```bash
cd /srv/adelaide-sphere/services && set -a && . ./.env && set +a && docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" ms-mysql mysql -uroot -e "CREATE DATABASE IF NOT EXISTS melbourne_sphere_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'ms_restore'@'%' IDENTIFIED BY '$(openssl rand -hex 16)'; GRANT ALL PRIVILEGES ON melbourne_sphere_restore.* TO 'ms_restore'@'%';"
```

Copy `ms-backup.key` to the server temporarily, run
`infrastructure/backup/restore-drill.sh` as its header shows, complete the
manual checks it prints, record the result in
`docs/operations/restore-drills.md`, then **shred the key** and drop the
`_restore` database.

---

## 16. Monitoring and logs

| What | How |
| --- | --- |
| Site up | External uptime monitor (UptimeRobot, Better Stack, …) on `https://melbournesphere.com/` and `https://melbournesphere.com/api/v1/health/ready`, alerting after 3 minutes |
| Worker alive | Monitor `https://melbournesphere.com/admin/` screens daily, or scrape `http://127.0.0.1:9464/metrics` (`ms_worker_up`, heartbeats) with a local Prometheus — `infrastructure/monitoring/` |
| Operational thresholds | `GET /api/v1/admin/operations/status` (queue age, failed enquiries, stuck media…) — runbook §5 |
| TLS expiry | `sudo certbot certificates`; the uptime monitor's certificate check |
| Disk | `df -h /` weekly, alert at 80% (images, backups, Docker volumes) |
| Backups | `tail /srv/adelaide-sphere/logs/backup.log`; alert if the newest file in `backups/` is older than 26 hours |

Logs:

```bash
sudo journalctl -u ms-api -f
```

```bash
sudo journalctl -u ms-worker -f
```

```bash
sudo journalctl -u ms-web -f
```

```bash
docker logs --tail 100 -f ms-mysql
```

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Cap the journal:

```bash
sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=1G/' /etc/systemd/journald.conf && sudo systemctl restart systemd-journald
```

Record the on-call responder in `docs/operations/runbook.md` §5 before launch.

---

## 17. Releasing an update

For the existing server running as `deploy`, use the checked-in
[`scripts/deploy-vps.sh`](../../scripts/deploy-vps.sh). It matches the current
`/srv/adelaide-sphere` layout, NVM installation, systemd units and production
`shared/*.env` files. Do not run it as root or from the Mac.

After pushing the script to `master`, install it once on the VPS:

```bash
git --git-dir=/srv/adelaide-sphere/repo.git fetch origin
git --git-dir=/srv/adelaide-sphere/repo.git show master:scripts/deploy-vps.sh > /srv/adelaide-sphere/deploy.sh.new &&
  bash -n /srv/adelaide-sphere/deploy.sh.new &&
  mv /srv/adelaide-sphere/deploy.sh.new /srv/adelaide-sphere/deploy.sh
```

Deploy with one command (sudo may request your password):

```bash
bash /srv/adelaide-sphere/deploy.sh
```

An optional branch or commit argument selects another revision. Only deploy
reviewed code with passing CI. Repeat the installation block when the deployment
script itself changes.

The script locks concurrent deployments, fetches Git, builds in a fresh worktree
with pinned Node/pnpm, checks migration status, checks Nginx read permissions,
and creates a compressed database backup. Build or backup failures leave the
running release unchanged. It atomically switches `current`, restarts the three
Melbourne Sphere services and checks API, worker, web and Nginx routes. Startup
failures trigger application rollback to the previous release. The restart can
cause a brief interruption; this is not zero-downtime deployment.

Pending or failed migrations stop the script before switching. Schema changes
need a reviewed backup/migration plan before retrying; this script never rolls
back a database or runs seeders. It retains releases and backups for recovery
and does not change Docker, TLS, Nginx configuration, shared secrets or Siri
Education services. The existing static Nginx error page remains in place.

After success, check admin sign-in, logo settings, a media upload and the public
site. HTTP health checks do not replace these browser checks. Failed build
worktrees are retained for inspection; clean them up separately when no longer
needed.

---

## 18. Rolling back

**Code only (no migration in the bad release):**

```bash
sudo -iu ms bash -c 'ln -sfn "$(cat /srv/adelaide-sphere/previous-release)" /srv/adelaide-sphere/current && sed -i "/^APP_VERSION=/d" /srv/adelaide-sphere/shared/worker.env && echo "APP_VERSION=$(cat /srv/adelaide-sphere/current/REVISION)" >> /srv/adelaide-sphere/shared/worker.env && sudo /usr/bin/systemctl restart ms-api && sleep 5 && sudo /usr/bin/systemctl restart ms-worker && sudo /usr/bin/systemctl restart ms-web && sudo /usr/bin/systemctl reload nginx'
```

**The bad release included a migration:** Prisma migrations have no automatic
undo. Either ship a reviewed forward migration that corrects it (preferred), or,
if data was damaged, restore the encrypted backup `deploy-vps.sh` wrote to
`/srv/adelaide-sphere/backups/before-deploy/` immediately before migrating (runbook §4) — after a restore drill on that file into a `_restore`
database proves it is good. Never edit or delete a row in `_prisma_migrations`
by hand.

---

## 19. Troubleshooting

| Symptom | Likely cause | Check / fix |
| --- | --- | --- |
| `ms-api` restarts in a loop | Production configuration refused | `journalctl -u ms-api -n 30`; the message lists each bad variable |
| `DATABASE_URL: must use verified TLS` | Query string missing or path not encoded | `?sslmode=verify-ca&sslca=%2Fsrv%2Fmelbourne-sphere%2Fshared%2Fmysql-ca.pem`; the file must be readable by `ms` |
| Readiness `503 Database unavailable` | MySQL down, wrong password, CA mismatch after a volume re-create | `docker compose ps`; re-copy `ca.pem` (6.5) after any new MySQL volume |
| Uploads stay *Processing* | Worker stopped, or wrong S3 credentials | `systemctl status ms-worker`; Queue monitor → Workers; runbook "If uploads are stuck" |
| Upload fails in the browser (CORS / 403 `SignatureDoesNotMatch`) | `MEDIA_S3_ENDPOINT` not the public media host, `Host` not passed unchanged, or `MINIO_API_CORS_ALLOW_ORIGIN` wrong | Section 8.2 note, section 9.3 media server, section 6.3 |
| Images missing, pages 500 | Web built without `MEDIA_PUBLIC_BASE_URL` | Rebuild with `web.env` loaded (10.5), restart `ms-web` |
| Edits take up to 5 minutes to appear | Revalidation not reaching the web tier | `WEB_REVALIDATE_TOKEN` equals `REVALIDATE_TOKEN`; `curl -X POST https://melbournesphere.com/api/revalidate` answers `401` (not `503`) |
| Admin sign-in rejected with an origin error | `TRUSTED_ORIGINS` does not match the address in the browser | Must be exactly `https://melbournesphere.com` |
| Client IPs all `127.0.0.1` in audit and rate limits | `TRUST_PROXY` not `1` | Set it; restart API |
| Unknown public URL shows an empty page | Not-found interception missing | Section 9.3 `@not_found`; `_not-found.html` exists under `current/apps/web/.next/server/app/` |
| Contact form says submissions are closed | `TURNSTILE_SITE_KEY` missing at web runtime, or the secret missing on the API | Both env files; restart both |
| Enquiry delivery *Failed* | Mail provider rejected | `lastError` in the Enquiries screen; runbook "Failed email" |
| Build killed | Out of memory | Swap (3.4), or stop `ms-web` during `next build` on a small VPS |

---

## 20. A staging server

Identical procedure on a second VPS with its own domain (e.g.
`staging.melbournesphere.com`), its own database, buckets and **every secret
regenerated** (runbook §1: nothing shared). Additionally:

- Never copy production personal data into staging.
- Protect it with nginx basic auth or an IP allow-list, and make it
  non-indexable: add `add_header X-Robots-Tag "noindex, nofollow" always;` to the
  site server block and a `location = /robots.txt { return 200 "User-agent: *\nDisallow: /\n"; }`.
- Use Resend's staging key and a staging sender.
