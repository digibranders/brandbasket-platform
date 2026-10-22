#!/usr/bin/env bash
# Installs the Brandbasket VPS CI, run as root on the VPS: install-ci.sh [--apply] (deploy/vps/install.sh ci calls it). Without
# --apply it prints the plan and changes nothing. Safe to run again: every step checks or overwrites with the same content.
# Adapted from Firstfold's ci/install-ci.sh; it touches nothing of Firstfold's.
#
# Needs first (install.sh github, services, autodeploy): the deploy user and its read-only GitHub deploy key and
# ~deploy/.ssh/config alias for brandbasket-platform, the GitHub App files in ~deploy, Firstfold's
# /usr/local/lib/firstfold/github-status.sh, the sudoers file /etc/sudoers.d/brandbasket-deploy and the shared lock
# library /usr/local/lib/brandbasket/heavy-lock.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"
# shellcheck source=../install-lib.sh
source "$SRC/install-lib.sh"
parse_args "$@"
[[ -z "$STEP" ]] || die "usage: install-ci.sh [--apply]"
need_root

readonly LIB=/usr/local/lib/brandbasket
readonly CI_ROOT=/srv/brandbasket-ci
readonly CI_HOME=/var/lib/brandbasket-ci

say "== checking what this needs"
id deploy >/dev/null 2>&1 || die "user deploy does not exist"
need_file /home/deploy/.ssh/github-brandbasket-platform "run install.sh github first"
need_file /usr/local/lib/firstfold/github-status.sh "Firstfold's GitHub reporting library"
need_file /home/deploy/.github-app-id "the GitHub App id"
need_file /home/deploy/.github-app-key.pem "the GitHub App key"
need_file /etc/sudoers.d/brandbasket-deploy "run install.sh services first"
need_file "$LIB/heavy-lock.sh" "run install.sh autodeploy first"
need_file /etc/brandbasket-platform-build.env "run install.sh dirs-env first"
(( MISSING )) || say "  all present"

say "== user bbci (runs the checks; no shell, no sudo, no access to secrets)"
if id bbci >/dev/null 2>&1; then
  say "  user bbci exists"
else
  act "useradd --system bbci (home $CI_HOME, shell nologin)" \
    useradd --system --home-dir "$CI_HOME" --create-home --shell /usr/sbin/nologin bbci
fi
act "chmod 700 $CI_HOME" chmod 700 "$CI_HOME"

say "== directories"
dir 0755 deploy:deploy "$CI_ROOT"
for d in archives mirrors state; do dir 0700 deploy:deploy "$CI_ROOT/$d"; done
dir 0755 root:root "$CI_ROOT/work"
dir 0755 root:root "$LIB"

say "== programs and sandbox files"
put 0755 "$HERE/brandbasket-ci" /usr/local/bin/brandbasket-ci
put 0755 "$HERE/brandbasket-ci-sandbox" /usr/local/sbin/brandbasket-ci-sandbox
for f in ci-steps.sh ci-checks.py ci-hosts ci-resolv.conf; do put 0644 "$HERE/$f" "$LIB/$f"; done
put 0644 "$SRC/heavy-lock.sh" "$LIB/heavy-lock.sh"

say "== firewall: bbci may use loopback only on ephemeral ports"
if (( APPLY )); then
  bash "$HERE/install-ci-firewall.sh" --apply
elif id bbci >/dev/null 2>&1; then
  bash "$HERE/install-ci-firewall.sh" | sed 's/^/  /'
else
  say "  would add the rules once user bbci exists"
fi

say "== timer"
put 0644 "$HERE/brandbasket-ci.service" /etc/systemd/system/brandbasket-ci.service
put 0644 "$HERE/brandbasket-ci.timer" /etc/systemd/system/brandbasket-ci.timer
if (( APPLY )); then
  systemd-analyze verify /etc/systemd/system/brandbasket-ci.service /etc/systemd/system/brandbasket-ci.timer \
    || { remove_added /etc/systemd/system/brandbasket-ci.service /etc/systemd/system/brandbasket-ci.timer; die "systemd rejected the CI units; removed them"; }
  systemctl daemon-reload
  systemctl enable --now brandbasket-ci.timer
  systemctl list-timers brandbasket-ci.timer --no-pager | sed -n 2p
fi
# The first run records the branch heads that already exist without checking them (all but development).
if (( APPLY )); then say "installed; status: runuser -u deploy -- brandbasket-ci --status"; else say "nothing changed. Run again with --apply."; fi
