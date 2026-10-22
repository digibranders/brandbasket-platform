#!/usr/bin/env bash
# Adds the Brandbasket CI sandbox's loopback rules to ufw, run as root on the VPS: install-ci-firewall.sh [--apply]. Without
# --apply it only says what it would do. Safe to run again: the block is added once, between marker comments, and the files
# are backed up first. Mirrors Firstfold's ci/install-ci-firewall.sh for user bbci.
#
# Why: Next's Turbopack build starts Node workers that connect back to it over 127.0.0.1 on a random port, so the sandbox
# (user bbci) needs loopback. Without a rule, loopback would also reach every service on this machine. With it, bbci may use
# loopback only on ephemeral ports (10240 and up, net.ipv4.ip_local_port_range), where only short-lived listeners like those
# workers live. Every service listens below 10240 (22, 53, 80, 443, 3000 to 3007, 3201, 3203, 5432, 8081), and bbci gets an
# immediate reset there. Traffic to this machine's public address travels over lo too, so the same rule applies to it. ufw's
# own "-o lo -j ACCEPT" comes after this block, so everyone else is unaffected.
#
# Firstfold's block (BEGIN/END firstfold-ci sandbox) sits in the same two files. This script never reads or writes a line
# outside its own markers, except to find the one anchor line it inserts before; it inserts before that same anchor, so the
# two blocks end up side by side. The new file is parsed with iptables-restore --test before it replaces the old one, so a
# mistake cannot leave ufw with a broken rule file.
set -euo pipefail

APPLY=0
case "${1:-}" in
  "") ;;
  --apply) APPLY=1 ;;
  *) echo "usage: install-ci-firewall.sh [--apply]" >&2; exit 64 ;;
esac

[[ "$(id -u)" == 0 ]] || { echo "run as root" >&2; exit 1; }
id bbci >/dev/null 2>&1 || { echo "user bbci does not exist yet (install-ci.sh creates it)" >&2; exit 1; }
[[ "$(cut -f1 /proc/sys/net/ipv4/ip_local_port_range)" -ge 10240 ]] \
  || { echo "ephemeral ports start below 10240; adjust this rule first" >&2; exit 1; }

readonly BEGIN="# BEGIN brandbasket-ci sandbox (brandbasket-platform/deploy/vps/ci/install-ci-firewall.sh)"
readonly END="# END brandbasket-ci sandbox"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
changed=0

add_block() { # <rules file> <chain> <restore command>
  local file=$1 chain=$2 restore=$3 new
  if grep -qF "$BEGIN" "$file"; then echo "$file: already has the Brandbasket block"; return 0; fi
  grep -qx -- "-A $chain -o lo -j ACCEPT" "$file" || { echo "$file: no '-A $chain -o lo -j ACCEPT' line" >&2; exit 1; }
  if (( ! APPLY )); then echo "$file: would add the Brandbasket block before '-A $chain -o lo -j ACCEPT' (backup first)"; return 0; fi
  new="$(mktemp "$file.new.XXXXXX")"
  python3 - "$file" "$new" "$chain" "$BEGIN" "$END" <<'PY'
import sys
path, new, chain, begin, end = sys.argv[1:]
anchor = f"-A {chain} -o lo -j ACCEPT\n"
block = (
    f"{begin}\n"
    f"-A {chain} -o lo -m owner --uid-owner bbci -p tcp --dport 10240:65535 -j ACCEPT\n"
    f"-A {chain} -o lo -m owner --uid-owner bbci -p tcp -j REJECT --reject-with tcp-reset\n"
    f"-A {chain} -o lo -m owner --uid-owner bbci -j REJECT\n"
    f"{end}\n"
)
text = open(path).read()
assert text.count(anchor) == 1, f"{path}: expected exactly one {anchor!r}"
open(new, "w").write(text.replace(anchor, block + anchor))
PY
  if ! "$restore" --test --noflush < "$new"; then
    rm -f "$new"; echo "$file: the new rules did not parse; nothing was changed" >&2; exit 1
  fi
  cp -p "$file" "$file.bak-$stamp"
  chmod --reference="$file" "$new"
  mv "$new" "$file"
  changed=1
  echo "$file: block added (backup $file.bak-$stamp)"
}

add_block /etc/ufw/before.rules ufw-before-output iptables-restore
add_block /etc/ufw/before6.rules ufw6-before-output ip6tables-restore
if (( APPLY )) && (( changed )); then
  ufw reload
  iptables -S ufw-before-output | grep -c "uid-owner bbci" | xargs echo "IPv4 bbci rules loaded:"
  ip6tables -S ufw6-before-output | grep -c "uid-owner bbci" | xargs echo "IPv6 bbci rules loaded:"
fi
(( APPLY )) || echo "nothing changed. Run again with --apply."
