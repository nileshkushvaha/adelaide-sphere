# Database backups

Encrypted logical backups of the production MySQL database, on a schedule the
server keeps for itself (SRS BACK 001, BACK 002, MON 001, MON 002, NFR 009).

| File | What it is |
| --- | --- |
| `backup-database.sh` | Takes one encrypted dump. Knows nothing about schedules or retention. |
| `run-scheduled-backup.sh` | The scheduled job: one tier per run. Dumps or promotes, copies off-site, prunes, records the result. **The only thing systemd calls.** |
| `db-target.sh` | Reads the database host, port and name out of `shared/api.env`. Shared with `scripts/deploy-vps.sh`. |
| `restore-drill.sh` | Restores a backup into an isolated `_restore` database and verifies it. |
| `mirror-media.sh` | Copies the media bucket off-site, hourly. The database dump contains no uploaded files. |
| `notify-failure.sh` | Emails a human when a scheduled job fails. Run by the `OnFailure` units; never fails itself. |
| `systemd/` | The units and timers. Copy them to `/etc/systemd/system/`; do not hand-write units on the server. |

## The two tiers

| Tier | When | Retained | How the file is produced |
| --- | --- | --- | --- |
| `daily` | 03:30 Adelaide, every day | **30 days** | A fresh `mysqldump`, gzipped and encrypted in one pipeline. |
| `weekly` | 04:30 Adelaide, Sundays | **180 days** | The most recent daily file, hard-linked into `backups/weekly/`. |

The weekly tier does not take a second dump. The one-hour RPO comes from binary
logs, not from a second logical dump an hour later, so a second dump would add
load to a small shared VPS without adding recovery ground — and it could fail on
its own schedule, leaving the archive quietly empty. Promoting the daily file
means the weekly archive is always a file that has already been written,
size-checked and checksummed. The two names share an inode until the daily
retention pass unlinks its own; `ln` falling back to `cp -p` handles the case
where `backups/` is ever moved to its own filesystem.

Times are 03:30 and 04:30 rather than the 02:30 an earlier runbook used because
South Australia moves 02:00 to 03:00 on the first Sunday in October: 02:30 does
not exist that day, so the run is skipped outright, and `Persistent=true` does
not recover it — the occurrence never existed, so nothing was "missed".

## Retention, and why the weekly tier is longer than BACK 001's baseline

**BACK 001 asks for daily recovery points retained 30 days, and says to avoid
unapproved long-term personal-data archives. The 180-day weekly tier is such an
archive, and it exists as an approved exception.** It was requested by the
project owner; the daily tier's 30 days is unchanged, so the BACK 001 baseline
is still met in full and the weekly tier is an addition, not a relaxation.

What it holds: complete encrypted dumps of every table — enquiry contact
details, review and comment private emails, abuse-report narratives, admin audit
rows — at 26 recovery points.

The honest position on PRIV 001. 180 days matches the longest live retention
window in the policy (enquiries, approved-review private email, abuse reports),
so no category is archived for longer than its own published window — **except
the shorter ones, which it necessarily outlives**: abuse IP signals (30 days) and
rejected reviews and comments (90 days) survive in a backup taken before their
purge ran. That is inherent to keeping backups at all, at any length. What makes
it acceptable is the control set, not a claim that it does not happen:

- encrypted to an `age` public key whose private half never exists on the server;
- readable only by `deploy` (`UMask=0077`), on a host where production
  credentials cannot delete the off-site copies (BACK 002);
- used for disaster recovery only, never for analysis or export;
- pruned automatically at 180 days, by a job that is tested, rather than by hand.

**The consequence with teeth (PRIV 002).** Restoring from the weekly archive can
put back rows the retention jobs have already purged. The privacy deletion
replay that every restore requires must therefore cover the whole period back to
the backup point — **up to 180 days for a weekly restore, not the ≤30 days a
daily restore implies**. `restore-drill.sh` prints this in its closing notes; it
is not optional, and a weekly restore without it is a privacy incident rather
than a bug.

## Why systemd timers and not the application's own scheduler

The app has a scheduled-task registry (`packages/domain/src/scheduled-tasks.ts`)
and a BullMQ runner, and the backup is deliberately **not** in it:

- SRS **FUT 003** excludes administrator-authored scheduled jobs, cron
  expressions and shell commands. A backup task in that registry would put a
  shell-invoking job one screen away from an administrator.
- A backup that runs inside the worker stops whenever the worker is down, which
  is exactly when it is most wanted.

The schedule lives in tracked unit files, changed only by an engineer with root
and a code review.

## Configuration

`run-scheduled-backup.sh` reads `$BACKUP_ROOT/shared/` (default
`/srv/adelaide-sphere`) and takes nothing on the command line but `--tier`.

`shared/api.env` supplies `DATABASE_URL`, which is where the host, port and
database name come from. It is **read, not sourced** — see `db-target.sh`: these
files hold a `DATABASE_URL` whose query string contains an unquoted `&`, and a
shell reads that as "run this assignment in the background", so sourcing the file
leaves `DATABASE_URL` empty while every other variable loads normally. systemd
parses `EnvironmentFile=` itself, which is why the services never saw this and
only shell scripts did.

`shared/backup.env` (mode 0600):

| Key | Required | Meaning |
| --- | --- | --- |
| `MYSQL_BACKUP_PASSWORD` | yes | Password for the backup account. Passed as `MYSQL_PWD`, never on a command line. |
| `BACKUP_OFFSITE_REMOTE` | no | An rclone remote and path, e.g. `offsite:as-backups/db`. Empty means no off-site copy is attempted. |
| `BACKUP_DB_HOST` / `BACKUP_DB_PORT` | no | Override the target derived from `DATABASE_URL`. See the wrapper note below. |
| `BACKUP_DB_USER` | no | Defaults to `adelaide_sphere_backup`. |
| `BACKUP_ALERT_EMAIL` | **strongly recommended** | Where failure alerts go. Unset, a failure is only ever visible in the journal and the operations endpoint. |
| `BACKUP_MIN_FREE_MB` | no | Free-space floor, default 1024. The run also insists on three times the last backup's size. |
| `MEDIA_MIRROR_TARGET` | no | rclone/mc target for the media bucket, e.g. `offsite/as-backups-media`. Empty means uploaded files exist only on this server. |
| `MEDIA_MIRROR_SOURCE` | no | Defaults to `local/adelaide-sphere-media`. |

Environment, not files: `BACKUP_ROOT` (set by the unit) and
`BACKUP_NO_BINLOG_POSITION=1`, which drops `--source-data` for a rehearsal
against an account without `RELOAD`. **Never set that on the server**: without
the binlog position there is no point-in-time recovery and the one-hour RPO
cannot be met.

### The `mysqldump` wrapper, and why the overrides exist

The deployment guide installs `/usr/local/bin/mysqldump` as a wrapper that runs
the client *inside* the MySQL container, so the client version always matches the
8.4 server. Inside that container MySQL listens on **3306**, while the port
published to the host — and therefore the port in `DATABASE_URL` — is **3317**.
A port derived from the URL is right for a client on the host and wrong for one
inside the container.

Every run prints both, so the journal shows which was used:

```
tier=daily database=adelaide_sphere user=adelaide_sphere_backup derived=127.0.0.1:3317 effective=127.0.0.1:3306
```

Before enabling the timers, check which case this host is in:

```bash
readlink -f "$(command -v mysqldump)" && head -3 "$(command -v mysqldump)"
```

If it is the container wrapper, set `BACKUP_DB_PORT=3306` in `shared/backup.env`.

## Installing

```bash
sudo cp /srv/adelaide-sphere/current/infrastructure/backup/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now adelaide-sphere-backup-daily.timer adelaide-sphere-backup-weekly.timer
systemctl list-timers 'adelaide-sphere-backup*'
sudo systemctl start adelaide-sphere-backup@daily.service   # once, to prove it
journalctl -u adelaide-sphere-backup@daily.service -n 40
```

## What it records, and what watches it

Each run rewrites `backups/state/<tier>.state` (`key=value`, mode 0640, written
to a temporary file and renamed, so a reader never sees half of one). A failed
run carries `last_success_epoch` **forward** rather than clearing it or moving it
to now: the alert measures time since the last *success*, and either of those
would hide the very outage it exists to report. `adelaide-sphere-backup-failed@`
records a run that died before it could record itself.

The worker reads those files at scrape time and publishes
`as_backup_last_success_timestamp_seconds{tier}` and its siblings — including
`as_backup_disk_free_bytes{tier}`, `as_media_mirror_last_success_timestamp_seconds`
and `as_restore_drill_last_success_timestamp_seconds` — on its
`/metrics` endpoint (`apps/worker/src/backup-status.ts`), and the API reports
`backup_age` in `GET /api/v1/admin/operations/status`. Set `BACKUP_STATE_DIR` for
both, or those series are not published at all — an absent series reads as "not
measured", where a zero would read as "measured, and fine".

**Alert rules must be tier-qualified.** `time() -
as_backup_last_success_timestamp_seconds > 26h` without a `{tier="daily"}`
selector matches the weekly series six days out of seven and pages every day.
See `docs/operations/alert-response.md` C10 and C10b.

## Disk space

A backup is not worth taking the database down for: MySQL on a full filesystem
stops accepting writes and the site stops with it. Every run therefore checks
free space **before** it starts dumping, and refuses if there is less than
`BACKUP_MIN_FREE_MB` (default 1024 MB) or less than three times the size of the
last backup, whichever is larger. The figure is recorded in the state file and
published as `as_backup_disk_free_bytes{tier}`, because until now nothing on
this host watched disk space at all.

## Media

`mirror-media.sh` runs hourly (`adelaide-sphere-media-mirror.timer`) and copies
the media bucket to `MEDIA_MIRROR_TARGET` with `mc mirror --overwrite` inside the
MinIO container. BACK 001 allows at most an hour of media replication lag.

This is not optional cover: **a database backup contains no uploaded files**,
only rows that point at them, so without the mirror a restored server is a
perfect database full of broken images.

It **never deletes at the far end** — no `--remove`. An accidental or malicious
deletion here must not propagate to the copy that exists to survive it; the
off-site bucket ages objects out with its own lifecycle policy. Unset, the job
reports hourly that nothing is being copied rather than failing.

## When something fails

`notify-failure.sh` sends to `BACKUP_ALERT_EMAIL` using the transport already
configured in `api.env` (Resend or SMTP). It is wired to the `OnFailure` units,
runs after the failed run has recorded itself, and **always exits 0**: it runs
because something has already failed, and a notifier that dies takes the only
signal with it. If it cannot send, it says so loudly and leaves the failure
standing. It prints no secrets — the API key and SMTP password go to curl
through a mode-600 file, never a command line.

The log tail in the message needs the account to be in `systemd-journal`
(`sudo usermod -aG systemd-journal deploy`); without it the mail still sends,
just thinner.

## Off-site

`BACKUP_OFFSITE_REMOTE` copies the backup and its checksum with `rclone copyto`.
**Nothing here ever deletes off-site.** BACK 002 wants storage that production
credentials cannot delete from, so the remote's own object-lock or lifecycle
policy owns expiry there — that is a decision, not an omission. Give the remote a
credential that can write but not delete.

## Checking a change to these scripts

Neither systemd nor a real server is available on a developer's machine, so:

```bash
python3 scripts/test-scheduled-backup.py     # hermetic; no database, no remote, ~2s
python3 scripts/test-deploy-vps.py           # deploy control flow, shares db-target.sh
/bin/bash -n infrastructure/backup/*.sh
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable -e SC1091 infrastructure/backup/*.sh
docker run --rm -v "$PWD/infrastructure/backup/systemd:/u:ro" ubuntu:24.04 \
  bash -c 'apt-get update -qq >/dev/null && apt-get install -y -qq systemd >/dev/null &&
           cd /u && systemd-analyze verify ./adelaide-sphere-backup@daily.service ./*.timer'
```

The unit verification reports two things that are true only in a container — no
`docker.service`, and no `/srv/adelaide-sphere` `ExecStart` — and nothing else.
Any other warning is a real finding.

The scripts are written for **bash 3.2**, the version macOS ships, so that
rehearsal is possible at all: no `mapfile`, no associative arrays, no `${var,,}`,
and no GNU-only `find -printf`, `stat -c` or `date -d`.
