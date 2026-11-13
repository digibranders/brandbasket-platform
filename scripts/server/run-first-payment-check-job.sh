#!/usr/bin/env bash
# What this does: calls the dashboard's first-payment check (POST /api/internal/check-first-payments) on this machine, with the
# bearer token from the dashboard's environment file, and prints the report it answers. The endpoint asks Razorpay about every
# first-month offer checkout still waiting for its first payment and records any it holds, for a payment whose webhook never
# arrived (docs/plans/63 in the BrandBasket workspace). Installed on the server as /usr/local/sbin/brandbasket-first-payment-check-job
# (root-owned) and run by brandbasket-first-payment-check.service as the app user.
#
# Assumes: the customer app is up on 127.0.0.1:3202 and PAYMENT_RECONCILE_TOKEN is set in the env file.
# The token is passed to curl on its standard input, so it never appears in the process list. Fails (exit 1) on any answer but
# 2xx and still prints the report, so systemd and journalctl show a failed run: 502 means Razorpay could not be asked about a
# checkout. Takes no action in the database itself; it only records a payment Razorpay already holds.
#
#   run-first-payment-check-job.sh --env-file /srv/brandbasket/shared/customer.env.production [--url URL]
set -euo pipefail

ENV_FILE=""
URL="http://127.0.0.1:3202/api/internal/check-first-payments"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [[ -z "$ENV_FILE" || ! -r "$ENV_FILE" ]]; then echo "--env-file must name a readable file." >&2; exit 64; fi

token="$(grep -E '^PAYMENT_RECONCILE_TOKEN=' "$ENV_FILE" | head -n 1 | cut -d= -f2-)"
token="${token#\"}"; token="${token%\"}"
if [[ -z "$token" ]]; then echo "PAYMENT_RECONCILE_TOKEN is not set in $ENV_FILE." >&2; exit 1; fi

# -K - reads curl options from standard input; --fail-with-body makes a 4xx/5xx a non-zero exit and still prints the report.
printf 'header = "Authorization: Bearer %s"\n' "$token" | curl --silent --show-error --fail-with-body --max-time 540 -K - -X POST "$URL"
echo
