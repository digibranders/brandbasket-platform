#!/usr/bin/env bash
# Self-check for deploy/vps/install-lib.sh, on a machine with GNU coreutils (the VPS, an Ubuntu container; skipped elsewhere):
#   bash deploy/vps/test/install-lib-test.sh
# Proves the path guard (realpath -m and an allowlist of Brandbasket prefixes: Firstfold paths, "..", look-alike names and a
# symlink out of /srv/brandbasket are refused; every path the installer writes is accepted) and ff_locks (a Firstfold directory
# or lock file other users cannot read is a STOP; an existing file is left alone; a missing one is planned, and created
# deploy:deploy 0644 only with --apply, never root-owned).
# `A && ok || bad` below is deliberate: ok and bad only print and cannot fail. APPLY is read by the sourced ff_locks.
# shellcheck disable=SC2015,SC2034
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! realpath -m / >/dev/null 2>&1; then echo "skipped: needs GNU realpath and stat"; exit 0; fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/brandbasket-lib-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
# shellcheck source=../install-lib.sh
source "$HERE/../install-lib.sh"
FAILED=0
ok() { echo "ok: $*"; }
bad() { echo "FAIL: $*" >&2; FAILED=1; }
refuses() { ( guard "$1" ) >/dev/null 2>&1 && bad "guard accepted $1" || ok "guard refuses $1"; }
accepts() { ( guard "$1" ) >/dev/null 2>&1 && ok "guard accepts $1" || bad "guard refused $1"; }

for p in /srv/firstfold/.release.lock /srv/brandbasket/../firstfold/x /etc/nginx/sites-available/firstfold /etc/passwd \
  /srv/brandbasketx /srv/brandbasket-evil/x /home/deploy/.ssh/config /etc/systemd/system/firstfold-app.service \
  /etc/sudoers.d/brandbasket-deploy /usr/local/bin/other /etc/brandbasket/../firstfold/x /home/brandbasketx/.ssh; do refuses "$p"; done
for p in /srv/brandbasket /srv/brandbasket/releases/x /srv/brandbasket-ci/sandbox.img /home/brandbasket/.ssh/config \
  /etc/brandbasket/offsite.sh /etc/brandbasket-platform-build.env /etc/systemd/system/brandbasket-app.service.d/10-notify-failure.conf \
  '/etc/systemd/system/srv-brandbasket\x2dci-sandbox.mount' /etc/sudoers.d/brandbasket /etc/nginx/sites-available/brandbasket \
  /etc/nginx/snippets/brandbasket-proxy.conf /usr/local/bin/brandbasket-ci /usr/local/sbin/brandbasket-migrate \
  /usr/local/lib/brandbasket/heavy-lock.sh /var/lib/brandbasket/last-backup-ok /var/backups/brandbasket/daily; do accepts "$p"; done
# ff_locks on a throwaway tree.
mkdir -p "$WORK/ff" "$WORK/ffci"
chmod 755 "$WORK" "$WORK/ff" "$WORK/ffci"
FF_LOCK_FILES=("$WORK/ff/.release.lock" "$WORK/ffci/.ci.lock")
: > "${FF_LOCK_FILES[0]}"; chmod 644 "${FF_LOCK_FILES[0]}"; : > "${FF_LOCK_FILES[1]}"; chmod 644 "${FF_LOCK_FILES[1]}"
( ff_locks ) >/dev/null 2>&1 && ok "ff_locks passes for readable files in traversable directories" || bad "ff_locks failed on a good tree"
chmod 700 "$WORK/ffci"
out="$( ( ff_locks ) 2>&1 )" && bad "ff_locks passed with a directory others cannot enter" || { [[ "$out" == *"STOP: $WORK/ffci has mode 700"* ]] && ok "a directory others cannot enter is a STOP" || bad "wrong message: $out"; }
chmod 755 "$WORK/ffci"; chmod 600 "${FF_LOCK_FILES[1]}"
out="$( ( ff_locks ) 2>&1 )" && bad "ff_locks passed with an unreadable file" || { [[ "$out" == *"STOP: ${FF_LOCK_FILES[1]}"* ]] && ok "a lock file others cannot read is a STOP" || bad "wrong message: $out"; }
chmod 644 "${FF_LOCK_FILES[1]}"
before="$(stat -c '%a %U %Y' "${FF_LOCK_FILES[0]}")"
( ff_locks ) >/dev/null 2>&1; [[ "$(stat -c '%a %U %Y' "${FF_LOCK_FILES[0]}")" == "$before" ]] && ok "an existing lock file is left alone" || bad "an existing lock file was changed"
rm -f "${FF_LOCK_FILES[1]}"
if id deploy >/dev/null 2>&1; then
  out="$( ( ff_locks ) 2>&1 )"
  [[ "$out" == *"create ${FF_LOCK_FILES[1]}: empty, owner deploy:deploy, mode 0644"* && ! -e "${FF_LOCK_FILES[1]}" ]] && ok "a plan says it would create the missing file as deploy:deploy 0644, and creates nothing" || bad "plan output: $out"
  if [[ $EUID == 0 ]]; then
    APPLY=1
    ( ff_locks ) >/dev/null 2>&1
    [[ "$(stat -c '%U:%G:%a' "${FF_LOCK_FILES[1]}")" == deploy:deploy:644 ]] && ok "--apply creates it deploy:deploy 0644" || bad "created as $(stat -c '%U:%G:%a' "${FF_LOCK_FILES[1]}")"
    APPLY=0
  fi
else
  echo "skipped: the plan and create checks need a user named deploy"
fi
(( FAILED == 0 )) && echo "all install-lib checks passed"
exit "$FAILED"
