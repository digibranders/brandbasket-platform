#!/usr/bin/env bash
# What this does: calls the dashboard's hourly hosting endpoint (POST /api/internal/sync-site-hosting) on this machine, with the
# bearer token from the dashboard's environment file, and prints the report it answers. The endpoint pauses the hosting
# project of every client whose website has ended and unpauses the ones that paid (docs/site-hosting.md). Installed on the
# server as /usr/local/sbin/brandbasket-site-hosting-job (root-owned) and run by brandbasket-site-hosting.service as the app user.
#
# Assumes: the dashboard is up on 127.0.0.1:3201 and SITE_HOSTING_SYNC_TOKEN is set in the env file.
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx and still prints the report, so systemd and journalctl show a failed run: 409 means the safety brake stopped a batch of
# pauses, 502 means the host refused a change. Takes no action in the database itself.
#
#   run-site-hosting-job.sh --env-file /srv/brandbasket/shared/platform.env.local [--dry-run] [--url URL]
# --dry-run asks the endpoint to report what it WOULD change without changing anything (?dryRun=1). Safe to run any time.
set -euo pipefail

ENV_FILE=""
DRY=0
URL="http://127.0.0.1:3201/api/internal/sync-site-hosting"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi

token="$(grep -E '^SITE_HOSTING_SYNC_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "SITE_HOSTING_SYNC_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

[[ $DRY -eq 1 ]] && URL="$URL?dryRun=1"

# -K - reads curl options from standard input; --fail-with-body makes a 4xx/5xx a non-zero exit and still prints the report.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail-with-body --max-time 540 -K - -X POST "$URL"
echo
