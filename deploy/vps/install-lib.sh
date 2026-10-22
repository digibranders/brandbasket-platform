# shellcheck shell=bash disable=SC2034
# Helpers shared by deploy/vps/install.sh and deploy/vps/ci/install-ci.sh. Sourced, never run.
#
# Every action goes through `act`, `put` or `dir`, which print what they would do and do it only when APPLY=1 (--apply).
# Everything `put` and `dir` write must resolve (realpath -m, so ".." and symlinks count) to a path under an explicit list of
# Brandbasket prefixes (guard below), and never to a path that names Firstfold, so a typo cannot touch a Firstfold file. The
# only Firstfold files this kit ever creates are the three lock files of ff_locks, and only when one is missing. The one file
# shared with Firstfold that Brandbasket edits is ufw's before.rules (install-ci-firewall.sh), between marker comments that
# name Brandbasket, and never outside them.

APPLY=0

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need_root() { [[ "$(id -u)" == 0 ]] || die "run as root"; }
# need_file <path> [why] and need_cmd <program>: a missing prerequisite stops --apply; a plan only says that the step would
# stop there, and sets MISSING so the step does not claim that everything is in place.
MISSING=0
need_file() {
  [[ -e "$1" ]] && return 0
  MISSING=1
  if (( APPLY )); then die "$1 is missing${2:+: $2}"; fi
  say "  NOT YET: $1 is missing${2:+ ($2)}; --apply would stop here"
}
need_cmd() {
  command -v "$1" >/dev/null && return 0
  MISSING=1
  if (( APPLY )); then die "$1 must be installed"; fi
  say "  NOT YET: $1 is not installed; --apply would stop here"
}

# guard <path>: refuses any path that does not resolve under a Brandbasket prefix below, and any that names Firstfold. The
# path is resolved with realpath -m first, so "/srv/brandbasket/../firstfold/x" and a symlink out of /srv/brandbasket are
# judged by where they really lead.
guard() {
  local p
  p="$(realpath -m -- "$1")" || die "cannot resolve $1"
  case "$p" in
    *firstfold*) die "refusing to touch $1: it is a Firstfold path ($p)" ;;
  esac
  case "$p" in
    /srv/brandbasket | /srv/brandbasket/* | /srv/brandbasket-ci | /srv/brandbasket-ci/* \
      | /home/brandbasket | /home/brandbasket/* \
      | /etc/brandbasket | /etc/brandbasket/* | /etc/brandbasket-platform-build.env \
      | /etc/systemd/system/brandbasket-* | /etc/systemd/system/srv-brandbasket* \
      | /etc/sudoers.d/brandbasket \
      | /etc/nginx/sites-available/brandbasket | /etc/nginx/sites-enabled/brandbasket | /etc/nginx/snippets/brandbasket-* \
      | /usr/local/bin/brandbasket-* | /usr/local/sbin/brandbasket-* | /usr/local/lib/brandbasket | /usr/local/lib/brandbasket/* \
      | /var/lib/brandbasket | /var/lib/brandbasket/* | /var/lib/brandbasket-ci | /var/lib/brandbasket-ci/* \
      | /var/backups/brandbasket | /var/backups/brandbasket/*) ;;
    *) die "refusing to touch $1: it is not under a Brandbasket path ($p)" ;;
  esac
}

# act <description> <command...>: prints the description; runs the command only with --apply.
act() {
  say "  $1"
  shift
  if (( APPLY )); then "$@"; fi
}

# put <mode> <source> <destination> [owner:group]: installs a file (root:root by default) when it is new or different.
put() {
  local mode=$1 src=$2 dst=$3 owner=${4:-root:root} state=new
  guard "$dst"
  [[ -f "$src" ]] || die "missing source file $src"
  if [[ -e "$dst" ]]; then
    if cmp -s "$src" "$dst"; then state=unchanged; else state=changed; fi
  fi
  say "  file $dst ($state, mode $mode, owner $owner)"
  if (( APPLY )) && [[ "$state" != unchanged ]]; then
    install -o "${owner%%:*}" -g "${owner##*:}" -m "$mode" "$src" "$dst"
  fi
}

# dir <mode> <owner:group> <path>
dir() {
  guard "$3"
  if [[ -d "$3" ]]; then say "  directory $3 (exists)"; return 0; fi
  say "  directory $3 (new, mode $1, owner $2)"
  if (( APPLY )); then install -d -o "${2%%:*}" -g "${2##*:}" -m "$1" "$3"; fi
}

# remove_added <path>...: takes back files this run added (a failed check), Brandbasket paths only.
remove_added() {
  local p
  for p in "$@"; do guard "$p"; rm -f -- "$p"; done
}

# The three lock files of Firstfold's that every Brandbasket build, deploy and CI run holds (heavy-lock.sh). They are the
# only Firstfold paths this kit ever creates, and only when missing.
FF_LOCK_FILES=(/srv/firstfold/.release.lock /srv/firstfold-website/.release.lock /srv/firstfold-ci/.ci.lock)

# ff_locks: checks that user brandbasket can open each of Firstfold's lock files read-only, and creates one that is missing.
# Never changes an existing Firstfold file or directory: a directory other users cannot enter, or a file they cannot read, is
# a STOP for the owner to decide (this function dies even in a plan). A Firstfold part that is not installed is skipped.
ff_locks() {
  local file dir d mode owner
  for file in "${FF_LOCK_FILES[@]}"; do
    dir=${file%/*}
    if [[ ! -d "$dir" ]]; then
      say "  $dir does not exist (that part of Firstfold is not installed): skipped, as heavy-lock.sh skips it"
      continue
    fi
    d=$dir
    while [[ -n "$d" ]]; do
      mode="$(stat -c %a "$d")"
      (( 8#$mode & 1 )) || die "STOP: $d has mode $mode, so other users cannot enter it and brandbasket could not open $file. This kit does not change Firstfold's permissions; ask the owner."
      d=${d%/*}
    done
    if [[ -e "$file" ]]; then
      read -r mode owner < <(stat -c '%a %U' "$file")
      (( 8#$mode & 4 )) || die "STOP: $file (owner $owner, mode $mode) is not readable by other users, so brandbasket could not open it. This kit does not change Firstfold's permissions; ask the owner."
      say "  $file exists (owner $owner, mode $mode): left as it is"
    else
      id deploy >/dev/null 2>&1 || die "user deploy does not exist"
      act "create $file: empty, owner deploy:deploy, mode 0644 (Firstfold opens it for writing as deploy, so never root-owned)" \
        install -o deploy -g deploy -m 0644 /dev/null "$file"
    fi
    if [[ -e "$file" ]] && id brandbasket >/dev/null 2>&1; then
      # shellcheck disable=SC2016 # the single quotes are for the inner sh
      runuser -u brandbasket -- sh -c ': < "$1"' _ "$file" || die "user brandbasket cannot open $file read-only; this kit does not change Firstfold's permissions"
      say "  brandbasket can open $file read-only"
    fi
  done
}

# parse_args <args...>: sets APPLY and EMAIL; the first non-option word is left in STEP.
STEP=""
EMAIL=""
parse_args() {
  while (( $# )); do
    case "$1" in
      --apply) APPLY=1 ;;
      --email) EMAIL="${2:?--email needs an address}"; shift ;;
      -h | --help) STEP=help ;;
      -*) die "unknown option: $1" ;;
      *) [[ -z "$STEP" ]] || die "one step at a time (got $STEP and $1)"; STEP=$1 ;;
    esac
    shift
  done
}
