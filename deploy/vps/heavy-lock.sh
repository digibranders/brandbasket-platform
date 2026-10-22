# shellcheck shell=bash disable=SC2034
# One heavy job at a time on this box. Brandbasket and Firstfold share 4 vCPUs, so a Brandbasket build, deploy or CI run
# must never overlap a Firstfold one, and the reverse. Sourced by brandbasket-platform-autodeploy,
# brandbasket-platform-release and brandbasket-ci. Installed as /usr/local/lib/brandbasket/heavy-lock.sh (root-owned).
#
# Firstfold's jobs run as the `deploy` user and Brandbasket's as `brandbasket`; each project's files are its own user's. Each
# lock is a flock(1) lock, exclusive. This is how Firstfold's installed scripts (read on 2026-10-22) take theirs:
#
#   /srv/brandbasket/.release.lock         Brandbasket's own: its autodeploy, release and CI hold it. Owned by brandbasket.
#   /srv/firstfold/.release.lock           firstfold-platform-autodeploy: `exec 9>file; flock -n 9 || exit 0`, held for the
#                                          whole deploy. Busy means "trying again next run", exit 0, no alert. The release
#                                          script (manual runs only) waits up to 30 minutes on the same file.
#   /srv/firstfold-website/.release.lock   firstfold-website-autodeploy and -release: the same.
#   /srv/firstfold-ci/.ci.lock             firstfold-ci: `flock -n 9 || exit 0` at the start, held for the whole run. It does
#                                          not look at the release locks; before each commit it asks systemd whether a
#                                          Firstfold autodeploy service is active. Holding this file is the only way to
#                                          keep it out of a Brandbasket build.
#
# Firstfold's three files are owned by deploy, mode 0644, in directories every user may traverse (checked on the server on
# 2026-10-22). Brandbasket opens them READ-ONLY: flock(2) needs no write access, so a Brandbasket process can hold the lock
# without being able to change or truncate a Firstfold file. install.sh checks that this still works and creates a missing
# file as deploy:deploy 0644 (Firstfold opens it for writing as deploy, so it must never be root-owned).
#
# Holding the three Firstfold files makes Firstfold's timers skip their minute quietly: nothing fails and nothing alerts.
# Firstfold's autodeploys never wait on them, only a hand-started deploy from the Mac does (it waits up to 30 minutes, which
# is longer than any Brandbasket job here).
#
# HOW THEY ARE HELD. The locks are held by a small holder process (bb_holder_body), never by the calling script. A script that
# held the descriptors itself would pass them to every child (pnpm, node, git, curl), and an orphan left behind by a
# killed build would keep Firstfold locked out. The holder is the only process with the files open; it releases them when the
# caller releases them, and within two seconds of the caller dying for any reason (including kill -9).
#
# bb_take_heavy_locks takes all four or none. With a wait it polls: take everything, and if any is busy give everything back
# and look again after BB_LOCK_POLL seconds. Nothing is ever held while waiting for another, so there is no deadlock and no
# lock is kept away from a Firstfold timer by a Brandbasket job that is only waiting.
#
# Return values: 0 held; 1 busy (BB_LOCK_BUSY names the file); 2 a lock file could not be opened (BB_LOCK_BUSY names it). 2 is
# an error, not "busy": callers must exit non-zero and alert, because a lock that cannot be opened protects nothing.
#
# The variables below may be set before sourcing (the self-test does); production never sets them.

: "${BB_OWN_LOCK_FILE:=/srv/brandbasket/.release.lock}"
: "${BB_HEAVY_LOCK_FILES:=$BB_OWN_LOCK_FILE /srv/firstfold/.release.lock /srv/firstfold-website/.release.lock /srv/firstfold-ci/.ci.lock}"
: "${BB_LOCK_POLL:=5}"
BB_LOCK_HOLDER=""
BB_LOCK_BUSY=""

# bb_holder_body <caller pid>: runs in its own process. Opens and locks every file, prints "ok", "busy <file>" or
# "unopenable <file>" as its only line of output, then holds the locks until it is told to stop or the caller is gone.
# A Firstfold directory that does not exist (Firstfold not installed) is skipped; an existing directory whose lock file
# cannot be opened is an error.
bb_holder_body() {
  local caller=$1 file fd sleeper="" held=()
  trap '[[ -z "$sleeper" ]] || kill "$sleeper" 2>/dev/null; exit 0' TERM INT HUP
  for file in $BB_HEAVY_LOCK_FILES; do
    if [[ "$file" == "$BB_OWN_LOCK_FILE" ]]; then
      # Brandbasket's own file: append mode, so opening never truncates it.
      { exec {fd}>>"$file"; } 2>/dev/null || { echo "unopenable $file"; exit 2; }
    else
      [[ -d "${file%/*}" ]] || continue
      # Another project's file: read-only, so this process can neither write nor truncate it.
      { exec {fd}<"$file"; } 2>/dev/null || { echo "unopenable $file"; exit 2; }
    fi
    flock -n "$fd" || { echo "busy $file"; exit 1; }
    held+=("$fd")
  done
  echo ok
  # The pause between looks at the caller runs without the lock files open, so a pause left behind when this process is
  # stopped (it cannot always be killed in time) holds nothing.
  while kill -0 "$caller" 2>/dev/null; do
    ( for fd in "${held[@]}"; do exec {fd}>&-; done; exec sleep 2 ) &
    sleeper=$!
    wait "$sleeper" 2>/dev/null || true
    sleeper=""
  done
}

# bb_release_heavy_locks: stops the holder, which frees every lock. Returns when they are free.
bb_release_heavy_locks() {
  local holder=$BB_LOCK_HOLDER n=0
  [[ -n "$holder" ]] || return 0
  BB_LOCK_HOLDER=""
  kill "$holder" 2>/dev/null || true
  wait "$holder" 2>/dev/null || true
  # wait cannot always see a holder started by another function of this shell; make sure it is gone.
  while kill -0 "$holder" 2>/dev/null && (( n < 100 )); do sleep 0.05; n=$((n + 1)); done
  return 0
}

# bb_try_take: one attempt. 0 held, 1 busy, 2 cannot open. Never waits.
bb_try_take() {
  local line="" out holder caller=$BASHPID
  BB_LOCK_BUSY=""
  exec {out}< <(bb_holder_body "$caller")
  holder=$!
  IFS= read -r -t 30 line <&"$out" || true
  exec {out}<&-
  case "$line" in
    ok)
      BB_LOCK_HOLDER=$holder
      return 0 ;;
    "busy "*)
      BB_LOCK_BUSY=${line#busy }
      wait "$holder" 2>/dev/null || true
      return 1 ;;
    "unopenable "*)
      BB_LOCK_BUSY="${line#unopenable } (cannot open it)"
      wait "$holder" 2>/dev/null || true
      return 2 ;;
    *)
      BB_LOCK_BUSY="the lock holder gave no answer (${line:-nothing})"
      kill "$holder" 2>/dev/null || true
      wait "$holder" 2>/dev/null || true
      return 2 ;;
  esac
}

# bb_take_heavy_locks [seconds]: see the header. With seconds > 0 it keeps trying, take-all-or-none, for that long.
bb_take_heavy_locks() {
  local wait=${1:-0} deadline rc
  deadline=$((SECONDS + wait))
  while :; do
    if bb_try_take; then return 0; else rc=$?; fi
    (( rc == 2 )) && return 2
    (( SECONDS >= deadline )) && return 1
    sleep "$BB_LOCK_POLL"
  done
}

# bb_bounded <command...>: call as `bb_bounded "$0" "$@"` before a script takes the heavy locks. The timers' units set
# BRANDBASKET_BOUNDED=1 (their own TimeoutStartSec is the limit). A run started by hand has no limit of its own, so it is
# started again under one: systemd-run with RuntimeMaxSec=45min when this user has a systemd user session, otherwise
# `timeout 45m`. Every process of the run is stopped at the limit, so nothing is left holding a build or a lock.
bb_bounded() {
  [[ -z "${BRANDBASKET_BOUNDED:-}" ]] || return 0
  export BRANDBASKET_BOUNDED=1
  if command -v systemd-run >/dev/null && [[ -S "${XDG_RUNTIME_DIR:-/nonexistent}/bus" ]]; then
    exec systemd-run --user --quiet --wait --pipe --collect -p RuntimeMaxSec=45min \
      --setenv=BRANDBASKET_BOUNDED --setenv=PATH --setenv=HOME --working-directory="$PWD" -- "$@"
  fi
  exec timeout --kill-after=2m 45m "$@"
}
