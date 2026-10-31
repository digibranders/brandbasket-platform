#!/usr/bin/env bash
# What this does: calls the dashboard's nightly site analytics endpoint (POST /api/internal/roll-up-site-analytics) on this
# machine, with the bearer token from the dashboard's environment file, and prints the report it answers. Installed on the VPS as
# /usr/local/sbin/brandbasket-site-rollup-job (root-owned) and run by brandbasket-site-rollup.service as the brandbasket user.
#
# Assumes: the dashboard is up on 127.0.0.1:3201 and SITE_ANALYTICS_TOKEN is set in the env file (docs/site-analytics.md).
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx, so systemd and journalctl show a failed run. After the roll-up it also asks /api/internal/retry-conversions to send any
# first payment to GA4 and Meta again that failed (plan 59).
#
#   run-site-rollup-job.sh --env-file /srv/brandbasket/shared/platform.env.local [--dry-run] [--url URL]
# --dry-run asks the endpoint to report what it WOULD write without writing or deleting (?dryRun=1). Safe to run any time.
set -euo pipefail

ENV_FILE=""
DRY=0
URL="http://127.0.0.1:3201/api/internal/roll-up-site-analytics"
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

token="$(grep -E '^SITE_ANALYTICS_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "SITE_ANALYTICS_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

[[ $DRY -eq 1 ]] && URL="$URL?dryRun=1"

# -K - reads curl options from standard input; --fail makes a 4xx/5xx a non-zero exit; the body is still printed on success.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail --max-time 540 -K - -X POST "$URL"
echo

# Then the failed sends to GA4 and Meta (plan 59): same secret, own endpoint. A dry run writes nothing, so it sends nothing either.
if [[ $DRY -eq 0 ]]; then
  printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail --max-time 120 -K - -X POST "${URL%/roll-up-site-analytics}/retry-conversions"
  echo
fi
