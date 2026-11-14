#!/usr/bin/env bash
# What this does: calls the dashboard's sign-up reminder job (POST /api/internal/send-signup-reminders) on this machine, with the
# bearer token from the dashboard's environment file, and prints the report it answers. The endpoint sends one reminder email
# to abandoned sign-ups older than 1 day (D21). Installed on the server as /usr/local/sbin/brandbasket-signup-reminder-job
# (root-owned) and run by brandbasket-signup-reminder.service as the app user.
#
# Assumes: the customer app is up on 127.0.0.1:3202 and SIGNUP_REMINDER_TOKEN is set in the env file.
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx and still prints the report, so systemd and journalctl show a failed run.
#
#   run-signup-reminder-job.sh --env-file /srv/brandbasket/shared/customer.env.production [--url URL]
set -euo pipefail

ENV_FILE=""
URL="http://127.0.0.1:3202/api/internal/send-signup-reminders"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi

token="$(grep -E '^SIGNUP_REMINDER_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "SIGNUP_REMINDER_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

# -K - reads curl options from standard input; --fail-with-body makes a 4xx/5xx a non-zero exit and still prints the report.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail-with-body --max-time 540 -K - -X POST "$URL"
echo
