#!/usr/bin/env bash
# What this does: calls the dashboard's kickoff endpoint (POST /api/internal/start-builds-after-kickoff) on this machine, with the
# bearer token from the dashboard's environment file, and prints the report it answers (checked, started, failed). The endpoint
# starts the website build for every customer whose kickoff call is over (docs/kickoff-builds.md). Installed on the VPS as
# /usr/local/sbin/brandbasket-kickoff-builds-job (root-owned) and run by brandbasket-kickoff-builds.service as the brandbasket user.
#
# Assumes: the dashboard is up on 127.0.0.1:3201 and KICKOFF_SYNC_TOKEN is set in the env file.
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx and still prints the report, so systemd and journalctl show a failed run: 502 means a build could not be started. Takes no
# action in the database itself, and is safe to run as often as wanted.
#
#   run-kickoff-builds-job.sh --env-file /srv/brandbasket/shared/platform.env.local [--url URL]
set -euo pipefail

ENV_FILE=""
URL="http://127.0.0.1:3201/api/internal/start-builds-after-kickoff"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi

token="$(grep -E '^KICKOFF_SYNC_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "KICKOFF_SYNC_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

# -K - reads curl options from standard input; --fail-with-body makes a 4xx/5xx a non-zero exit and still prints the report.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail-with-body --max-time 540 -K - -X POST "$URL"
echo
