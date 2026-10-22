# shellcheck shell=bash disable=SC2034
# One heavy job at a time on this box. Brandbasket and Firstfold share 4 vCPUs, so a Brandbasket build, deploy or CI run
# must never overlap a Firstfold one, and the reverse. Sourced by brandbasket-platform-autodeploy,
# brandbasket-platform-release and brandbasket-ci. Installed as /usr/local/lib/brandbasket/heavy-lock.sh (root-owned).
#
# Every project here runs its jobs as the `deploy` user, which owns all of these files. Each is a flock(1) lock, exclusive.
# This is how Firstfold's installed scripts (read on 2026-10-22) take theirs:
#
#   /srv/brandbasket/.release.lock         Brandbasket's own: its autodeploy, release and CI hold it.
#   /srv/firstfold/.release.lock           firstfold-platform-autodeploy: `exec 9>file; flock -n 9 || exit 0`, held for the
#                                          whole deploy. Busy means "trying again next run", exit 0, no alert. The release
#                                          script (manual runs only) waits up to 30 minutes on the same file.
#   /srv/firstfold-website/.release.lock   firstfold-website-autodeploy and -release: the same.
#   /srv/firstfold-ci/.ci.lock             firstfold-ci: `flock -n 9 || exit 0` at the start, held for the whole run. It does
#                                          not look at the release locks; before each commit it asks systemd whether a
#                                          Firstfold autodeploy service is active. Holding this file is the only way to
#                                          keep it out of a Brandbasket build.
#
# So holding the three Firstfold files makes Firstfold's timers skip their minute quietly: nothing fails and nothing
# alerts. Firstfold's autodeploys never wait on them, only a hand-started deploy from the Mac does (it waits up to 30
# minutes, which is longer than any Brandbasket job here).
#
# bb_take_heavy_locks takes all four or none, never waiting on a busy one unless asked to. Nothing waits while holding
# another lock that a timer wants, so there is no deadlock: a timer-started job that finds any lock busy exits quietly.
#
# BB_HEAVY_LOCK_FILES may be set before sourcing (the self-test does); production never sets it.

: "${BB_HEAVY_LOCK_FILES:=/srv/brandbasket/.release.lock /srv/firstfold/.release.lock /srv/firstfold-website/.release.lock /srv/firstfold-ci/.ci.lock}"
BB_LOCK_FDS=()
BB_LOCK_BUSY=""

# bb_release_heavy_locks: closes every lock this shell holds.
bb_release_heavy_locks() {
  local fd
  for fd in "${BB_LOCK_FDS[@]}"; do exec {fd}>&-; done
  BB_LOCK_FDS=()
}

# bb_take_heavy_locks [seconds]: returns 0 holding every lock, or 1 holding none and with BB_LOCK_BUSY naming the file
# that was busy (or could not be opened). With seconds > 0 it waits that long for each lock; the default does not wait.
# A Firstfold directory that does not exist (Firstfold not installed) is skipped; Brandbasket's own must exist.
bb_take_heavy_locks() {
  local wait=${1:-0} file fd
  local -a flags
  if (( wait > 0 )); then flags=(-w "$wait"); else flags=(-n); fi
  BB_LOCK_BUSY=""
  for file in $BB_HEAVY_LOCK_FILES; do
    if [[ ! -d "${file%/*}" ]]; then
      [[ "$file" == /srv/brandbasket/* ]] || continue
    fi
    # Append mode: opening must not truncate or change a file that belongs to another project.
    if ! { exec {fd}>>"$file"; } 2>/dev/null; then
      BB_LOCK_BUSY="$file (cannot open it)"
      bb_release_heavy_locks
      return 1
    fi
    if ! flock "${flags[@]}" "$fd"; then
      BB_LOCK_BUSY="$file"
      exec {fd}>&-
      bb_release_heavy_locks
      return 1
    fi
    BB_LOCK_FDS+=("$fd")
  done
  return 0
}
