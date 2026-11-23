#!/usr/bin/env bash
# What this does: calls the dashboard's email queue endpoint (POST /api/internal/drain-email-queue) on this machine, with the bearer token
# from the dashboard's environment file, and prints the report it answers. The endpoint sends the emails Brevo did not take the first
# time, with backoff (3 attempts, then failed). Installed on the VPS as /usr/local/sbin/brandbasket-email-queue-job (root-owned) and
# run by brandbasket-email-queue.service as the brandbasket user.
#
# Assumes: the customer app is up on 127.0.0.1:3202 and EMAIL_QUEUE_TOKEN is set in the env file.
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx and still prints the report, so systemd and journalctl show a failed run (503: Brevo or the token is not set up). Takes no
# action in the database itself, and is safe to run as often as wanted.
#
#   run-email-queue-job.sh --env-file /srv/brandbasket/shared/customer.env.production [--url URL]
set -euo pipefail

ENV_FILE=""
URL="http://127.0.0.1:3202/api/internal/drain-email-queue"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi

token="$(grep -E '^EMAIL_QUEUE_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "EMAIL_QUEUE_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

# -K - reads curl options from standard input; --fail-with-body makes a 4xx/5xx a non-zero exit and still prints the report.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail-with-body --max-time 540 -K - -X POST "$URL"
echo
