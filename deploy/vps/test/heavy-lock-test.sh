#!/usr/bin/env bash
# Self-check for deploy/vps/heavy-lock.sh, run on any machine with bash 4.4 or newer: bash deploy/vps/test/heavy-lock-test.sh
# Uses throwaway lock files and second processes playing Firstfold. Proves:
#   - all four locks are taken when free, and the Firstfold-style files are only opened read-only (their content is kept, and as
#     a normal user they are mode 0444, so a write open would fail);
#   - a lock held by another user (as root, the test switches to `nobody` for the take) in a 0644 file of another owner is held
#     read-only, and that file is not changed;
#   - a busy lock (each one in turn) makes the take fail without waiting, name the busy file and leave nothing held;
#   - a wait polls, take-all-or-none: while one lock is busy the free ones are not held, and the take succeeds once it frees;
#   - a lock file that cannot be opened (missing, or no permission) is return code 2, not "busy", and leaves nothing held;
#   - a child process started while the locks are held does not keep them after they are released;
#   - the holder lets go within seconds when the process that took the locks is killed with kill -9;
#   - bb_bounded re-runs a hand-started command under `timeout 45m`, and leaves a unit-started one alone.
# Uses util-linux flock when present and a python stand-in otherwise (macOS has none).
# The single-quoted programs below are for the bash -c they are handed to.
# shellcheck disable=SC2016
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/brandbasket-lock-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
chmod 755 "$WORK"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

if ! command -v flock >/dev/null; then
  mkdir "$WORK/bin"
  cat > "$WORK/bin/flock" <<'SHIM'
#!/usr/bin/env python3
import fcntl, sys
# Only `flock -n <fd>`, which is all heavy-lock.sh uses.
try:
    fcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    sys.exit(1)
SHIM
  chmod +x "$WORK/bin/flock"
  export PATH="$WORK/bin:$PATH"
fi

mkdir -p "$WORK/bb" "$WORK/ff" "$WORK/ffweb" "$WORK/ffci"
chmod 755 "$WORK"/bb "$WORK"/ff "$WORK"/ffweb "$WORK"/ffci
OWN="$WORK/bb/.release.lock"
FILES=("$OWN" "$WORK/ff/.release.lock" "$WORK/ffweb/.release.lock" "$WORK/ffci/.ci.lock")
FOREIGN_MODE=0644
if [[ $EUID != 0 ]]; then FOREIGN_MODE=0444; fi
make_files() {
  local f
  for f in "${FILES[@]}"; do
    rm -f "$f"
    if [[ "$f" == "$OWN" ]]; then : > "$f"; chmod 0644 "$f"; else echo "firstfold" > "$f"; chmod "$FOREIGN_MODE" "$f"; fi
  done
}
make_files
export BB_OWN_LOCK_FILE="$OWN" BB_HEAVY_LOCK_FILES="${FILES[*]}" BB_LOCK_POLL=0.2
# shellcheck source=../heavy-lock.sh
source "$HERE/../heavy-lock.sh"

# A second process holding one lock for a few seconds, standing in for a Firstfold job (read-only open: all it needs).
holder_pid=""
hold() { # <file> [seconds]
  ( exec 8<"$1"; flock -n 8 || exit 3; exec sleep "${2:-6}" ) &
  holder_pid=$!
  sleep 0.5
}
unhold() { kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; holder_pid=""; }
# Succeeds when every lock file can be locked by a fresh process.
all_free() {
  local f
  for f in "${FILES[@]}"; do ( exec 7<"$f"; flock -n 7 ) || return 1; done
}

before="$(cksum < "${FILES[1]}")"
bb_take_heavy_locks 0 || fail "free locks were not taken (busy: $BB_LOCK_BUSY)"
kill -0 "$BB_LOCK_HOLDER" || fail "no holder is running"
! all_free || fail "the locks are not held"
ok "all four taken when free, held by a holder process"
[[ "$(cksum < "${FILES[1]}")" == "$before" ]] || fail "a Firstfold lock file was changed"
ok "the Firstfold-style file is unchanged (opened read-only)"
bb_release_heavy_locks
all_free || fail "locks still held after release"
[[ -z "$BB_LOCK_HOLDER" ]] || fail "holder still recorded after release"
ok "release frees every lock"

# A child started while the locks are held must not keep them (an orphan from a killed build).
bb_take_heavy_locks 0 || fail "take failed"
sleep 30 &
child=$!
bb_release_heavy_locks
all_free || { kill "$child" 2>/dev/null; fail "a child process kept the locks after release"; }
kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true
ok "a child of the caller does not keep the locks"

for busy in "${FILES[@]}"; do
  hold "$busy"
  if bb_take_heavy_locks 0; then unhold; fail "took the locks while $busy was held elsewhere"; else rc=$?; fi
  [[ "$rc" == 1 ]] || { unhold; fail "busy lock gave return code $rc, expected 1"; }
  [[ "$BB_LOCK_BUSY" == "$busy" ]] || { unhold; fail "named $BB_LOCK_BUSY, expected $busy"; }
  [[ -z "$BB_LOCK_HOLDER" ]] || { unhold; fail "kept a holder after a failed take"; }
  unhold
  # Nothing may be left held by the failed attempt: every file is takeable again at once.
  bb_take_heavy_locks 0 || fail "a failed take left $BB_LOCK_BUSY held"
  bb_release_heavy_locks
  ok "busy ${busy#"$WORK"/}: refused with 1, named, nothing left held"
done

hold "${FILES[2]}"
start=$SECONDS
if bb_take_heavy_locks 1; then unhold; fail "a waiting take got a lock that was held"; fi
(( SECONDS - start >= 1 && SECONDS - start <= 4 )) || { unhold; fail "the wait took $((SECONDS - start)) s, expected about 1"; }
unhold
ok "a wait of 1 s gives up after about 1 s"

# Polling is take-all-or-none: while the last lock is busy, the first (free) one must not be held by the waiting process.
hold "${FILES[3]}" 4
( if bb_take_heavy_locks 10; then echo 0 > "$WORK/bgrc"; else echo $? > "$WORK/bgrc"; fi; sleep 2 ) &
bg=$!
free_probes=0
for _ in 1 2 3 4 5 6 7 8; do
  if ( exec 7<"${FILES[0]}"; flock -n 7 ); then free_probes=$((free_probes + 1)); fi
  sleep 0.2
done
(( free_probes >= 1 )) || { unhold; kill "$bg" 2>/dev/null || true; fail "the waiting take kept a free lock while it waited"; }
for _ in $(seq 1 100); do [[ -f "$WORK/bgrc" ]] && break; sleep 0.2; done
[[ "$(cat "$WORK/bgrc" 2>/dev/null || echo none)" == 0 ]] || { unhold; fail "the waiting take did not get the locks once they were free"; }
unhold
wait "$bg" 2>/dev/null || true
# The holder notices that its caller is gone within a couple of seconds.
freed=0
for _ in $(seq 1 40); do if all_free; then freed=1; break; fi; sleep 0.25; done
(( freed )) || fail "locks still held 10 s after the waiting process ended"
rm -f "$WORK/bgrc"
ok "a wait polls take-all-or-none ($free_probes of 8 probes found a free lock while waiting) and succeeds when the busy lock frees"

# An existing Firstfold directory whose lock file is missing: an error (2), not busy.
rm -f "${FILES[2]}"
if bb_take_heavy_locks 0; then fail "a missing lock file was not an error"; else rc=$?; fi
[[ "$rc" == 2 ]] || fail "a missing lock file gave return code $rc, expected 2"
[[ "$BB_LOCK_BUSY" == "${FILES[2]} (cannot open it)" ]] || fail "named '$BB_LOCK_BUSY'"
[[ -z "$BB_LOCK_HOLDER" ]] || fail "kept a holder after an error"
ok "a missing lock file in an existing directory: return code 2, named, nothing held"
make_files

if [[ $EUID != 0 ]]; then
  chmod 000 "${FILES[1]}"
  if bb_take_heavy_locks 0; then chmod "$FOREIGN_MODE" "${FILES[1]}"; fail "an unreadable lock file was taken"; else rc=$?; fi
  chmod "$FOREIGN_MODE" "${FILES[1]}"
  [[ "$rc" == 2 ]] || fail "an unreadable lock file gave return code $rc, expected 2"
  [[ "$BB_LOCK_BUSY" == "${FILES[1]} (cannot open it)" ]] || fail "named '$BB_LOCK_BUSY'"
  [[ -z "$BB_LOCK_HOLDER" ]] || fail "kept a holder after an error"
  all_free || fail "an unopenable file left a lock held"
  ok "a lock file without read permission: return code 2, named, nothing held"
fi

# A missing Firstfold directory (Firstfold not installed) is skipped.
rm -rf "$WORK/ffweb"
bb_take_heavy_locks 0 || fail "a missing Firstfold directory should be skipped (busy: $BB_LOCK_BUSY)"
bb_release_heavy_locks
ok "a missing Firstfold directory is skipped"
mkdir "$WORK/ffweb"; chmod 755 "$WORK/ffweb"; make_files

# The holder lets go by itself when the process that took the locks is killed.
"$BASH" -c 'source "$1"; bb_take_heavy_locks 0 && echo ready && exec sleep 60' _ "$HERE/../heavy-lock.sh" > "$WORK/ready" &
taker=$!
for _ in $(seq 1 50); do [[ -s "$WORK/ready" ]] && break; sleep 0.1; done
[[ -s "$WORK/ready" ]] || { kill "$taker" 2>/dev/null; fail "the second process did not take the locks"; }
! all_free || fail "the second process does not hold the locks"
kill -9 "$taker"; wait "$taker" 2>/dev/null || true
freed=0
for _ in $(seq 1 40); do if all_free; then freed=1; break; fi; sleep 0.25; done
(( freed )) || fail "the locks were still held 10 s after the taker was killed"
ok "a killed taker's locks are freed by the holder within seconds"

# bb_bounded: a hand-started command is re-run under a 45 minute timeout; a unit-started one (BRANDBASKET_BOUNDED=1) is not.
mkdir -p "$WORK/stub"
printf '#!/usr/bin/env bash\necho "timeout $*"\n' > "$WORK/stub/timeout"; chmod +x "$WORK/stub/timeout"
out="$(unset BRANDBASKET_BOUNDED XDG_RUNTIME_DIR; PATH="$WORK/stub:$PATH" "$BASH" -c 'source "$1"; shift; bb_bounded "$@"' _ "$HERE/../heavy-lock.sh" some-script --apply)"
[[ "$out" == "timeout --kill-after=2m 45m some-script --apply" ]] || fail "bb_bounded ran: $out"
out="$(BRANDBASKET_BOUNDED=1 PATH="$WORK/stub:$PATH" "$BASH" -c 'source "$1"; shift; bb_bounded "$@"; echo carried-on' _ "$HERE/../heavy-lock.sh" some-script)"
[[ "$out" == carried-on ]] || fail "bb_bounded re-ran a bounded run: $out"
ok "bb_bounded: hand run under timeout 45m, unit run left alone"

# As root, the same take as another user: Firstfold's files belong to root here (like deploy's on the server), mode 0644 or 0600.
if [[ $EUID == 0 ]] && command -v runuser >/dev/null && id nobody >/dev/null 2>&1; then
  make_files
  chown nobody "$OWN"
  inner='source "$1"; if bb_take_heavy_locks 0; then echo "taken"; bb_release_heavy_locks; else echo "rc=$? $BB_LOCK_BUSY"; fi'
  before="$(cksum < "${FILES[3]}")"
  out="$(runuser -u nobody -- env BB_OWN_LOCK_FILE="$OWN" BB_HEAVY_LOCK_FILES="${FILES[*]}" "$BASH" -c "$inner" _ "$HERE/../heavy-lock.sh")"
  [[ "$out" == taken ]] || fail "another user could not hold root-owned 0644 lock files read-only: $out"
  [[ "$(cksum < "${FILES[3]}")" == "$before" ]] || fail "a root-owned lock file was changed"
  chmod 0600 "${FILES[3]}"
  out="$(runuser -u nobody -- env BB_OWN_LOCK_FILE="$OWN" BB_HEAVY_LOCK_FILES="${FILES[*]}" "$BASH" -c "$inner" _ "$HERE/../heavy-lock.sh")"
  [[ "$out" == "rc=2 ${FILES[3]} (cannot open it)" ]] || fail "an unreadable root-owned lock file gave: $out"
  ok "another user: root-owned 0644 files are held read-only and unchanged; a 0600 file is return code 2"
elif [[ $EUID == 0 ]]; then
  echo "skipped: the cross-user check needs runuser and the user nobody"
fi
echo "all heavy-lock checks passed"
