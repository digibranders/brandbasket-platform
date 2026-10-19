#!/usr/bin/env bash
# What this does: writes the two nginx files that the staff console's server block relies on, from Cloudflare's published
# address ranges:
#   snippets/brandbasket-cloudflare-realip.conf   set_real_ip_from <each range>; real_ip_header CF-Connecting-IP;   (so $remote_addr is the visitor)
#   conf.d/brandbasket-cloudflare-geo.conf        geo $realip_remote_addr $brandbasket_from_cloudflare { ... }          (1 only for Cloudflare's own addresses;
#                                           the server block answers 444 to everything else). It checks the ORIGINAL connection address,
#                                           because after the real_ip step $remote_addr is the visitor, not Cloudflare.
# Assumes: run as root on the droplet (it writes under /etc/nginx), curl present, and either internet access to
# https://www.cloudflare.com/ips-v4 and ips-v6 or a directory holding copies of those two files (--from-dir).
# Dry-run by default: prints the snippets to the screen. --apply writes them (only when the result differs, and only after checking
# it has a plausible number of ranges), then you run `nginx -t && systemctl reload nginx`. Re-run it now and then (monthly is plenty,
# the bootstrap's timer does it): Cloudflare changes the list rarely. Takes no server address: it acts on this machine only.
#   cloudflare-ips.sh [--apply] [--from-dir DIR] [--nginx-dir /etc/nginx]
set -euo pipefail

APPLY=0
FROM_DIR=""
NGINX_DIR="/etc/nginx"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --from-dir) FROM_DIR="${2:?--from-dir needs a directory}"; shift 2 ;;
    --nginx-dir) NGINX_DIR="${2:?--nginx-dir needs a directory}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for family in ips-v4 ips-v6; do
  if [[ -n "$FROM_DIR" ]]; then cp "$FROM_DIR/$family" "$TMP/$family"; else curl --silent --show-error --fail --max-time 30 "https://www.cloudflare.com/$family" -o "$TMP/$family"; fi
done
# Only lines that look like a CIDR range are used: anything else in a download is ignored, never written into nginx config.
cat "$TMP/ips-v4" "$TMP/ips-v6" | tr -d '\r' | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$|^[0-9a-fA-F:]+/[0-9]{1,3}$' >"$TMP/ranges" || true
count="$(wc -l <"$TMP/ranges" | tr -d ' ')"
if [[ "$count" -lt 10 ]]; then echo "Only $count ranges found; Cloudflare publishes about 22. Refusing to write anything." >&2; exit 1; fi

{
  echo "# Written by scripts/server/cloudflare-ips.sh from https://www.cloudflare.com/ips-v4 and ips-v6. Do not edit by hand."
  while read -r r; do echo "set_real_ip_from $r;"; done <"$TMP/ranges"
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive off;"
} >"$TMP/realip.conf"
{
  echo "# Written by scripts/server/cloudflare-ips.sh. \$brandbasket_from_cloudflare is 1 only when the TCP connection itself came from Cloudflare."
  echo "geo \$realip_remote_addr \$brandbasket_from_cloudflare {"
  echo "    default 0;"
  while read -r r; do echo "    $r 1;"; done <"$TMP/ranges"
  echo "}"
} >"$TMP/geo.conf"

echo "$count Cloudflare ranges."
if [[ $APPLY -eq 0 ]]; then
  echo "[dry-run] would write $NGINX_DIR/snippets/brandbasket-cloudflare-realip.conf and $NGINX_DIR/conf.d/brandbasket-cloudflare-geo.conf:"
  sed 's/^/    /' "$TMP/realip.conf" | head -6; echo "    ..."
  echo "Nothing was written. Add --apply."
  exit 0
fi
mkdir -p "$NGINX_DIR/snippets" "$NGINX_DIR/conf.d"
changed=0
for pair in "realip.conf:snippets/brandbasket-cloudflare-realip.conf" "geo.conf:conf.d/brandbasket-cloudflare-geo.conf"; do
  src="$TMP/${pair%%:*}"; dest="$NGINX_DIR/${pair#*:}"
  if [[ -f "$dest" ]] && cmp -s "$src" "$dest"; then echo "unchanged $dest"; else install -m 644 "$src" "$dest"; echo "wrote $dest"; changed=1; fi
done
[[ $changed -eq 1 ]] && echo "Now: nginx -t && systemctl reload nginx"
exit 0
