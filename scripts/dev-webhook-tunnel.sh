#!/usr/bin/env bash
# Opens a public tunnel to the local customer app so Razorpay's webhooks can reach it, and prints the URL to register.
#
# Why: with BILLING_PROVIDER=razorpay a payment only activates a plan when Razorpay's signed webhook arrives, and
# Razorpay cannot call localhost. Run `pnpm dev` in one terminal and `pnpm dev:tunnel` in another.
#
# A quick tunnel gets a new address every run, so the webhook's URL in the Razorpay dashboard (Test Mode, Account &
# Settings, Webhooks) must be edited to match each time. Its secret is RAZORPAY_WEBHOOK_SECRET from
# apps/platform/.env.local, and its events are the ones listed in apps/platform/.env.example.
set -euo pipefail

PORT="${PORT:-3198}"
command -v cloudflared >/dev/null || { echo "cloudflared is not installed: brew install cloudflared" >&2; exit 1; }

log="$(mktemp)"
trap 'kill "${tunnel_pid:-}" 2>/dev/null || true; rm -f "$log"' EXIT

cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}" >"$log" 2>&1 &
tunnel_pid=$!

url=""
for _ in $(seq 1 30); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)"
  [[ -n "$url" ]] && break
  kill -0 "$tunnel_pid" 2>/dev/null || { cat "$log" >&2; exit 1; }
  sleep 1
done
[[ -n "$url" ]] || { echo "The tunnel gave no address after 30 seconds:" >&2; cat "$log" >&2; exit 1; }

echo
echo "Razorpay test-mode webhook URL (paste it into the dashboard):"
echo "  ${url}/api/webhooks/razorpay"
echo
echo "Tunnel is up for http://localhost:${PORT}. Press Ctrl+C to close it."
wait "$tunnel_pid"
