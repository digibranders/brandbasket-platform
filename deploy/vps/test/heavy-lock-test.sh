#!/usr/bin/env bash
# Self-check for deploy/vps/heavy-lock.sh, run on any machine with bash 4.1 or newer: bash deploy/vps/test/heavy-lock-test.sh
# Proves, with throwaway lock files and a second process playing Firstfold: all four locks are taken when free; a busy
# lock (each one in turn) makes the take fail without waiting, name the busy file and leave nothing held; a wait of a
# second gives up after about a second; and releasing frees every lock again. Uses util-linux flock when present and a
# python stand-in otherwise (macOS has none).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/brandbasket-lock-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if ! command -v flock >/dev/null; then
  mkdir "$WORK/bin"
  cat > "$WORK/bin/flock" <<'SHIM'
#!/usr/bin/env python3
import fcntl, sys, time
args = sys.argv[1:]
wait = None
if args[0] == "-n":
    wait, args = 0, args[1:]
elif args[0] == "-w":
    wait, args = float(args[1]), args[2:]
fd, deadline = int(args[0]), time.time() + (wait or 0)
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sys.exit(0)
    except OSError:
        if wait is None:
            fcntl.flock(fd, fcntl.LOCK_EX)
            sys.exit(0)
        if time.time() >= deadline:
            sys.exit(1)
        time.sleep(0.05)
SHIM
  chmod +x "$WORK/bin/flock"
  export PATH="$WORK/bin:$PATH"
fi

mkdir -p "$WORK/bb" "$WORK/ff" "$WORK/ffweb" "$WORK/ffci"
FILES=("$WORK/bb/.release.lock" "$WORK/ff/.release.lock" "$WORK/ffweb/.release.lock" "$WORK/ffci/.ci.lock")
export BB_HEAVY_LOCK_FILES="${FILES[*]}"
# shellcheck source=../heavy-lock.sh
source "$HERE/../heavy-lock.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# A second process holding one lock for a few seconds, standing in for a Firstfold job.
holder_pid=""
hold() { # <file>
  ( exec 8>>"$1"; flock -n 8 || exit 3; sleep 6 ) &
  holder_pid=$!
  sleep 0.5
}
unhold() { kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; holder_pid=""; }

bb_take_heavy_locks 0 || fail "free locks were not taken (busy: $BB_LOCK_BUSY)"
(( ${#BB_LOCK_FDS[@]} == 4 )) || fail "expected 4 held locks, have ${#BB_LOCK_FDS[@]}"
ok "all four taken when free"
bb_release_heavy_locks
(( ${#BB_LOCK_FDS[@]} == 0 )) || fail "locks still listed after release"

for busy in "${FILES[@]}"; do
  hold "$busy"
  if bb_take_heavy_locks 0; then unhold; fail "took the locks while $busy was held elsewhere"; fi
  [[ "$BB_LOCK_BUSY" == "$busy" ]] || { unhold; fail "named $BB_LOCK_BUSY, expected $busy"; }
  (( ${#BB_LOCK_FDS[@]} == 0 )) || { unhold; fail "kept locks after a failed take"; }
  unhold
  # Nothing may be left held by the failed attempt: every file is takeable again at once.
  bb_take_heavy_locks 0 || fail "a failed take left $BB_LOCK_BUSY held"
  bb_release_heavy_locks
  ok "busy ${busy#"$WORK"/}: refused, named, nothing left held"
done

hold "${FILES[2]}"
start=$SECONDS
if bb_take_heavy_locks 1; then unhold; fail "a waiting take got a lock that was held"; fi
(( SECONDS - start >= 1 && SECONDS - start <= 4 )) || { unhold; fail "the wait took $((SECONDS - start)) s, expected about 1"; }
unhold
ok "a wait of 1 s gives up after about 1 s"

# A missing Firstfold directory is skipped.
rm -rf "$WORK/ffweb"
bb_take_heavy_locks 0 || fail "a missing Firstfold directory should be skipped (busy: $BB_LOCK_BUSY)"
(( ${#BB_LOCK_FDS[@]} == 3 )) || fail "expected 3 held locks with Firstfold's website absent"
bb_release_heavy_locks
ok "a missing Firstfold directory is skipped"
echo "all heavy-lock checks passed"
