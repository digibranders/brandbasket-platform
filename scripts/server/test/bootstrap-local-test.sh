#!/usr/bin/env bash
# What this does: rehearses scripts/server/bootstrap-droplet.sh --on-server --apply on this machine with no server involved:
# FYNIX_PREFIX points "/" at a temporary directory, and fake apt-get, adduser, chown, systemctl, nginx, visudo, certbot and curl sit on
# PATH. Proves: files land where they should with the right contents (hostnames substituted), a second run reports everything
# unchanged, and when `nginx -t` fails the links the run added are removed again and the script exits non-zero.
# Assumes bash, and that node/pnpm are present (the Node step is skipped with --skip-node). It cannot prove `nginx -t` accepts the real
# files: that, and everything that needs root, can only be checked on the droplet.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../bootstrap-droplet.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/fynix-bootstrap-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
SHIMS="$WORK/shims"; PFX="$WORK/root"; mkdir -p "$SHIMS" "$PFX"
for tool in apt-get adduser chown systemctl visudo certbot corepack; do printf '#!/bin/sh\necho "%s $*" >> "%s/calls.log"\n' "$tool" "$WORK" >"$SHIMS/$tool"; done
cat >"$SHIMS/dpkg" <<'SH'
#!/bin/sh
exit 1
SH
cat >"$SHIMS/nginx" <<SH
#!/bin/sh
[ -e "$WORK/nginx-fails" ] && { echo "nginx: [emerg] simulated failure" >&2; exit 1; }
exit 0
SH
cat >"$SHIMS/curl" <<'SH'
#!/bin/bash
# cloudflare-ips.sh asks for .../ips-v4 and ips-v6 with -o FILE
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; http*) url="$1"; shift ;; *) shift ;; esac; done
case "$url" in
  *ips-v4) for i in 1 2 3 4 5 6 7 8 9 10 11 12; do echo "10.$i.0.0/16"; done > "$out" ;;
  *ips-v6) echo "2400:cb00::/32" > "$out" ;;
esac
SH
chmod +x "$SHIMS"/*
export PATH="$SHIMS:$PATH" FYNIX_PREFIX="$PFX" FYNIX_TEST=1
failures=0
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then printf '  PASS  %s\n' "$what"; else printf '  FAIL  %s\n' "$what"; failures=$((failures + 1)); fi; }
run() { bash "$SCRIPT" --on-server --skip-node "$@"; }

echo "== dry-run writes nothing"
run --app-host dash.example.com >/dev/null
check "no files created" test ! -e "$PFX/etc"

echo "== apply (no certificate yet)"
run --apply --app-host dash.example.com --admin-host staff.example.com | sed 's/^/    /'
check "migrate wrapper installed executable" test -x "$PFX/usr/local/sbin/fynix-migrate"
check "units installed" test -f "$PFX/etc/systemd/system/fynix-app.service"
check "sudoers installed" grep -q 'NOPASSWD: /usr/local/sbin/fynix-migrate' "$PFX/etc/sudoers.d/fynix"
check "hostname substituted in the port-80 file" grep -q 'server_name dash.example.com staff.example.com;' "$PFX/etc/nginx/sites-available/fynix-acme.conf"
check "port-80 site enabled" test -L "$PFX/etc/nginx/sites-enabled/fynix-acme.conf"
check "https dashboard file NOT installed before the certificate exists" test ! -e "$PFX/etc/nginx/sites-available/fynix-app.conf"
check "Cloudflare geo file written" grep -q 'default 0;' "$PFX/etc/nginx/conf.d/fynix-cloudflare-geo.conf"
check "proxy snippet overwrites X-Forwarded-For" grep -q 'X-Forwarded-For \$remote_addr;' "$PFX/etc/nginx/snippets/fynix-proxy.conf"
check "timers installed but not enabled" bash -c "! grep -q 'enable' '$WORK/calls.log'"

echo "== a certificate and an origin certificate appear; second run installs the https files"
mkdir -p "$PFX/etc/letsencrypt/live/dash.example.com" "$PFX/etc/ssl/fynix"
touch "$PFX/etc/letsencrypt/live/dash.example.com/fullchain.pem" "$PFX/etc/ssl/fynix/staff.pem" "$PFX/etc/ssl/fynix/staff.key"
run --apply --app-host dash.example.com --admin-host staff.example.com | sed 's/^/    /'
check "dashboard https file uses the new name and cert path" grep -q '/etc/letsencrypt/live/dash.example.com/fullchain.pem' "$PFX/etc/nginx/sites-available/fynix-app.conf"
check "console file uses the new name" grep -q 'server_name staff.example.com;' "$PFX/etc/nginx/sites-available/fynix-admin.conf"
check "both enabled" bash -c "test -L '$PFX/etc/nginx/sites-enabled/fynix-app.conf' && test -L '$PFX/etc/nginx/sites-enabled/fynix-admin.conf'"

echo "== third run changes nothing"
out="$(run --apply --app-host dash.example.com --admin-host staff.example.com)"
# (The fake user never really exists and the fake dpkg reports every package missing, so those two lines repeat; files must not.)
check "no file installed, link made or directory created" bash -c "! grep -E -- '-> (installed|enabled|create /)' <<<'$out'"

echo "== nginx -t fails: the links this run added are taken out again"
unlink "$PFX/etc/nginx/sites-enabled/fynix-app.conf"
touch "$WORK/nginx-fails"
if run --apply --app-host dash.example.com --admin-host staff.example.com 2>&1 | sed 's/^/    /'; then rc=0; else rc=1; fi
check "script exited non-zero" test "$rc" -eq 1 || true
check "the dashboard link added by the failed run is gone" test ! -e "$PFX/etc/nginx/sites-enabled/fynix-app.conf"
check "links that were there before are untouched" test -L "$PFX/etc/nginx/sites-enabled/fynix-acme.conf"
echo
if [[ $failures -eq 0 ]]; then echo "ALL CHECKS PASSED"; else echo "$failures CHECK(S) FAILED"; exit 1; fi
