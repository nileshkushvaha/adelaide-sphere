#!/usr/bin/env bash
# Tell a human that a scheduled backup failed (SRS MON 002).
#
#   notify-failure.sh --unit adelaide-sphere-backup@daily --subject-suffix 'database backup'
#
# Run by the OnFailure units, after the failed run has recorded itself. It uses
# the same mail transport the application uses, read from shared/api.env, and
# sends to BACKUP_ALERT_EMAIL in shared/backup.env.
#
# Two rules this script exists to obey:
#   - it must never fail. It runs *because* something already failed; a
#     notifier that dies takes the only signal with it, so every path exits 0.
#   - it must never print a secret. The API key and SMTP password are passed to
#     curl through a file or a variable, never on a command line or in a log.
set -uo pipefail

ROOT="${BACKUP_ROOT:-/srv/adelaide-sphere}"
UNIT=""
WHAT="backup"
while [ $# -gt 0 ]; do
  case "$1" in
    --unit) UNIT="${2:-}"; shift 2 ;;
    --subject-suffix) WHAT="${2:-backup}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 0 ;;
  esac
done

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=./db-target.sh
# shellcheck disable=SC1091
. "$HERE/db-target.sh" 2>/dev/null || { echo 'notify-failure: cannot read db-target.sh; no notification sent.' >&2; exit 0; }

value() { env_file_value "$1" "$2" 2>/dev/null || true; }

TO=$(value "$ROOT/shared/backup.env" BACKUP_ALERT_EMAIL)
if [ -z "$TO" ]; then
  echo 'notify-failure: BACKUP_ALERT_EMAIL is not set in shared/backup.env; nothing was sent.' >&2
  echo 'notify-failure: until it is, a failed backup is only visible in the journal and in GET /admin/operations/status.' >&2
  exit 0
fi

FROM=$(value "$ROOT/shared/api.env" MAIL_FROM_ADDRESS)
[ -n "$FROM" ] || FROM="$TO"
TRANSPORT=$(value "$ROOT/shared/api.env" MAIL_TRANSPORT)
HOSTNAME_=$(hostname 2>/dev/null || echo unknown-host)
WHEN=$(date -u '+%Y-%m-%d %H:%M:%SZ')
SUBJECT="[Adelaide Sphere] ${WHAT} FAILED on ${HOSTNAME_}"

# The journal is the useful part of the message. It is only readable if this
# account is in the systemd-journal group; without it the mail still goes, just
# thinner, which is far better than no mail.
JOURNAL="(journal not readable by $(id -un); add this account to the systemd-journal group)"
if [ -n "$UNIT" ] && command -v journalctl >/dev/null 2>&1; then
  if lines=$(journalctl -u "$UNIT" -n 30 --no-pager 2>/dev/null) && [ -n "$lines" ]; then
    JOURNAL="$lines"
  fi
fi

STATE="(no state file)"
for candidate in "$ROOT"/backups/state/*.state; do
  [ -e "$candidate" ] || continue
  STATE="${STATE}
--- ${candidate##*/}
$(cat "$candidate" 2>/dev/null)"
done
STATE=${STATE#"(no state file)"}

BODY="A scheduled ${WHAT} failed and did not complete.

  host:  ${HOSTNAME_}
  unit:  ${UNIT:-unknown}
  when:  ${WHEN} (UTC)

Nothing else takes this backup, so the gap is real until it is fixed.

What to do:
  systemctl status ${UNIT:-adelaide-sphere-backup@daily}
  journalctl -u ${UNIT:-adelaide-sphere-backup@daily} -n 50 --no-pager
  bash /srv/adelaide-sphere/current/infrastructure/backup/run-scheduled-backup.sh --tier daily

Backup state files:
${STATE}

Last journal lines:
${JOURNAL}
"

send_resend() {
  key=$(value "$ROOT/shared/api.env" RESEND_API_KEY)
  [ -n "$key" ] || return 1
  base=$(value "$ROOT/shared/api.env" RESEND_API_BASE_URL)
  [ -n "$base" ] || base="https://api.resend.com"
  payload=$(TO="$TO" FROM="$FROM" SUBJECT="$SUBJECT" BODY="$BODY" node --input-type=module <<'NODE' 2>/dev/null
process.stdout.write(JSON.stringify({
  from: process.env.FROM, to: [process.env.TO],
  subject: process.env.SUBJECT, text: process.env.BODY,
}));
NODE
  ) || return 1
  # The key goes in a header file, so it never appears in the process list.
  headers=$(mktemp) || return 1
  chmod 600 "$headers"
  printf 'Authorization: Bearer %s\n' "$key" > "$headers"
  curl --silent --show-error --fail --max-time 20 \
    -X POST "$base/emails" \
    -H 'Content-Type: application/json' \
    -H "@$headers" \
    --data-binary "$payload" >/dev/null 2>&1
  status=$?
  rm -f "$headers"
  return $status
}

send_smtp() {
  host=$(value "$ROOT/shared/api.env" SMTP_HOST)
  [ -n "$host" ] || return 1
  port=$(value "$ROOT/shared/api.env" SMTP_PORT)
  [ -n "$port" ] || port=587
  user=$(value "$ROOT/shared/api.env" SMTP_USER)
  pass=$(value "$ROOT/shared/api.env" SMTP_PASSWORD)
  secure=$(value "$ROOT/shared/api.env" SMTP_SECURE)
  if [ "$secure" = "true" ] || [ "$port" = "465" ]; then scheme=smtps; else scheme=smtp; fi
  message=$(mktemp) || return 1
  chmod 600 "$message"
  {
    printf 'From: %s\n' "$FROM"
    printf 'To: %s\n' "$TO"
    printf 'Subject: %s\n' "$SUBJECT"
    printf 'Content-Type: text/plain; charset=utf-8\n\n'
    printf '%s\n' "$BODY"
  } > "$message"
  if [ -n "$user" ]; then
    # --user takes the password on the command line; pass it through the
    # environment-backed config file instead so it is never in the process list.
    config=$(mktemp) || { rm -f "$message"; return 1; }
    chmod 600 "$config"
    printf 'user = "%s:%s"\n' "$user" "$pass" > "$config"
    curl --silent --show-error --fail --max-time 20 --config "$config" \
      --url "$scheme://$host:$port" --ssl-reqd \
      --mail-from "$FROM" --mail-rcpt "$TO" --upload-file "$message" >/dev/null 2>&1
    status=$?
    rm -f "$config"
  else
    curl --silent --show-error --fail --max-time 20 \
      --url "$scheme://$host:$port" \
      --mail-from "$FROM" --mail-rcpt "$TO" --upload-file "$message" >/dev/null 2>&1
    status=$?
  fi
  rm -f "$message"
  return $status
}

sent=no
case "$TRANSPORT" in
  resend) send_resend && sent=yes ;;
  smtp) send_smtp && sent=yes ;;
  *)
    # No transport named, or a development one: try whatever is configured.
    if send_resend; then sent=yes; elif send_smtp; then sent=yes; fi
    ;;
esac

if [ "$sent" = yes ]; then
  echo "notify-failure: alerted $TO about $UNIT."
else
  # Loud, but still exit 0: the backup failure is the news, not this.
  echo "notify-failure: COULD NOT SEND the failure alert for $UNIT (transport '${TRANSPORT:-unset}'). The failure itself stands; check the journal." >&2
fi
exit 0
