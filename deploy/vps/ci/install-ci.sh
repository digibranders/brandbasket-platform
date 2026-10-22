#!/usr/bin/env bash
# Installs the Brandbasket VPS CI, run as root on the VPS: install-ci.sh [--apply] (deploy/vps/install.sh ci calls it). Without
# --apply it prints the plan and changes nothing. Safe to run again: every step checks or overwrites with the same content.
# Adapted from Firstfold's ci/install-ci.sh; it touches nothing of Firstfold's (it only checks that its lock files can be
# opened, and creates one that is missing, see ff_locks in install-lib.sh).
#
# Needs first (install.sh user, github, services, autodeploy): the brandbasket user with its read-only GitHub deploy key and
# ~brandbasket/.ssh/config alias for brandbasket-platform, the GitHub App files copied into ~brandbasket, Firstfold's
# /usr/local/lib/firstfold/github-status.sh, the sudoers file /etc/sudoers.d/brandbasket and the shared lock library
# /usr/local/lib/brandbasket/heavy-lock.sh.
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
readonly SANDBOX_FS=$CI_ROOT/sandbox
readonly SANDBOX_IMG=$CI_ROOT/sandbox.img
readonly SANDBOX_SIZE=8G
readonly CI_HOME=$SANDBOX_FS/home
readonly UNIT_DIR=/etc/systemd/system
MOUNT_UNIT="$(systemd-escape -p --suffix=mount "$SANDBOX_FS")"
readonly MOUNT_UNIT

say "== checking what this needs"
id brandbasket >/dev/null 2>&1 || die "user brandbasket does not exist (run install.sh user first)"
need_file /home/brandbasket/.ssh/github-brandbasket-platform "run install.sh github first"
need_file /usr/local/lib/firstfold/github-status.sh "Firstfold's GitHub reporting library"
need_file /home/brandbasket/.github-app-id "the GitHub App id, copied by install.sh github"
need_file /home/brandbasket/.github-app-key.pem "the GitHub App key, copied by install.sh github"
need_file /etc/sudoers.d/brandbasket "run install.sh services first"
need_file "$LIB/heavy-lock.sh" "run install.sh autodeploy first"
need_file /etc/brandbasket-platform-build.env "run install.sh dirs-env first"
need_cmd mkfs.ext4
(( MISSING )) || say "  all present"
ff_locks

say "== user bbci (runs the checks; no shell, no sudo, no access to secrets; home on the sandbox disk, created per run)"
if id bbci >/dev/null 2>&1; then
  say "  user bbci exists"
else
  act "useradd --system bbci (home $CI_HOME, shell nologin, no home directory yet)" \
    useradd --system --home-dir "$CI_HOME" --no-create-home --shell /usr/sbin/nologin bbci
fi

say "== directories"
dir 0755 brandbasket:brandbasket "$CI_ROOT"
for d in archives mirrors state; do dir 0700 brandbasket:brandbasket "$CI_ROOT/$d"; done
dir 0755 root:root "$SANDBOX_FS"
dir 0755 root:root "$LIB"

say "== sandbox disk: a fixed $SANDBOX_SIZE ext4 image at $SANDBOX_IMG, mounted at $SANDBOX_FS"
if [[ -e "$SANDBOX_IMG" ]]; then
  say "  $SANDBOX_IMG exists; not touched"
else
  guard "$SANDBOX_IMG"
  # shellcheck disable=SC2016 # the single quotes are for the inner bash
  act "create $SANDBOX_IMG: truncate -s $SANDBOX_SIZE (sparse), mkfs.ext4 -m 0, root:root 0600" \
    bash -c 'tmp="$1.new" && rm -f "$tmp" && truncate -s "$2" "$tmp" && mkfs.ext4 -q -F -m 0 -L bbci-sandbox "$tmp" && chmod 600 "$tmp" && mv "$tmp" "$1"' _ "$SANDBOX_IMG" "$SANDBOX_SIZE"
fi
if (( APPLY )) || [[ -e "$SANDBOX_IMG" ]]; then
  mount_tmp="$(mktemp -d)"
  cp "$HERE/brandbasket-ci-sandbox.mount" "$mount_tmp/$MOUNT_UNIT"
  systemd-analyze verify "$mount_tmp/$MOUNT_UNIT" || { rm -rf "${mount_tmp:?}"; die "systemd rejected the sandbox mount unit; nothing was installed"; }
  rm -rf "${mount_tmp:?}"
fi
put 0644 "$HERE/brandbasket-ci-sandbox.mount" "$UNIT_DIR/$MOUNT_UNIT"
if (( APPLY )); then
  systemctl daemon-reload
  systemctl enable --now "$MOUNT_UNIT"
  mountpoint -q "$SANDBOX_FS" || die "$SANDBOX_FS is not mounted after enabling $MOUNT_UNIT"
  say "  mounted: $(df -h --output=size,avail "$SANDBOX_FS" | tail -n 1 | sed 's/^ *//')"
else
  say "  would enable and start $MOUNT_UNIT and check that $SANDBOX_FS is a mount point"
fi

say "== programs and sandbox files"
put 0755 "$HERE/brandbasket-ci" /usr/local/bin/brandbasket-ci
put 0755 "$HERE/brandbasket-ci-sandbox" /usr/local/sbin/brandbasket-ci-sandbox
for f in ci-steps.sh ci-checks.py ci-hosts ci-resolv.conf; do put 0644 "$HERE/$f" "$LIB/$f"; done
put 0644 "$SRC/heavy-lock.sh" "$LIB/heavy-lock.sh"
put 0644 "$SRC/github-lib.sh" "$LIB/github-lib.sh"

say "== firewall: bbci may use loopback only on ephemeral ports"
if (( APPLY )); then
  bash "$HERE/install-ci-firewall.sh" --apply
elif id bbci >/dev/null 2>&1; then
  bash "$HERE/install-ci-firewall.sh" | sed 's/^/  /'
else
  say "  would add the rules once user bbci exists"
fi

say "== timer"
put 0644 "$HERE/brandbasket-ci.service" "$UNIT_DIR/brandbasket-ci.service"
put 0644 "$HERE/brandbasket-ci.timer" "$UNIT_DIR/brandbasket-ci.timer"
if (( APPLY )); then
  systemd-analyze verify "$UNIT_DIR/brandbasket-ci.service" "$UNIT_DIR/brandbasket-ci.timer" \
    || { remove_added "$UNIT_DIR/brandbasket-ci.service" "$UNIT_DIR/brandbasket-ci.timer"; die "systemd rejected the CI units; removed them"; }
  systemctl daemon-reload
  systemctl enable --now brandbasket-ci.timer
  systemctl list-timers brandbasket-ci.timer --no-pager | sed -n 2p
fi
# The first run records the branch heads that already exist without checking them (all but development).
if (( APPLY )); then say "installed; status: runuser -u brandbasket -- brandbasket-ci --status"; else say "nothing changed. Run again with --apply."; fi
