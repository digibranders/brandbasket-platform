#!/usr/bin/env bash
# What this does: calls the dashboard's daily erase endpoint (POST /api/internal/erase-closed-accounts) on this machine,
# with the bearer token from the dashboard's environment file, and prints the report it answers. Installed on the droplet as
# /usr/local/sbin/fynix-erase-job (root-owned) and run by fynix-erase.service as the deploy user.
#
# Assumes: the dashboard is up on 127.0.0.1:3001 and ACCOUNT_ERASE_TOKEN is set in the env file (docs/account-erasure.md).
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but 2xx,
# so systemd and journalctl show a failed run. Takes no action in the database itself.
#
#   run-erase-job.sh --env-file /srv/fynix/shared/platform.env.local [--dry-run] [--limit N] [--url URL]
# --dry-run asks the endpoint to report what it WOULD erase without erasing (?dryRun=1). Safe to run any time.
set -euo pipefail

ENV_FILE=""
DRY=0
LIMIT=""
URL="http://127.0.0.1:3001/api/internal/erase-closed-accounts"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --limit) LIMIT="${2:?--limit needs a number}"; shift 2 ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi
if [[ -n "$LIMIT" ]] && ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then echo "--limit must be a whole number from 1 to 100." >&2; exit 64; fi

token="$(grep -E '^ACCOUNT_ERASE_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "ACCOUNT_ERASE_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

query=""
[[ $DRY -eq 1 ]] && query="dryRun=1"
if [[ -n "$LIMIT" ]]; then query="${query:+$query&}limit=$LIMIT"; fi
[[ -n "$query" ]] && URL="$URL?$query"

# -K - reads curl options from standard input; --fail makes a 4xx/5xx a non-zero exit; the body is still printed on success.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail --max-time 540 -K - -X POST "$URL"
echo
