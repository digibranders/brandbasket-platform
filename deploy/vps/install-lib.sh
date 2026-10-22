# shellcheck shell=bash disable=SC2034
# Helpers shared by deploy/vps/install.sh and deploy/vps/ci/install-ci.sh. Sourced, never run.
#
# Every action goes through `act`, `put`, `dir` or `block`, which print what they would do and do it only when APPLY=1
# (--apply). Everything they write must have "brandbasket" in its path and "firstfold" nowhere in it, so a typo cannot touch a Firstfold file; the two
# files shared with Firstfold that Brandbasket must also edit (~deploy/.ssh/config and ufw's before.rules) are changed only
# between marker comments that name Brandbasket, and never outside them.

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

# guard <path>: refuses any path that does not name Brandbasket, and any that names Firstfold.
guard() {
  [[ "$1" == *brandbasket* ]] || die "refusing to touch $1: it is not a Brandbasket path"
  [[ "$1" != *firstfold* ]] || die "refusing to touch $1: it is a Firstfold path"
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

# block <file> <marker> <content>: appends "# BEGIN <marker>" ... "# END <marker>" to a file shared with another project,
# unless the block is already there. Nothing outside the markers is read or written. The marker must name Brandbasket.
block() {
  local file=$1 marker=$2 content=$3
  [[ "$marker" == *brandbasket* ]] || die "block marker must name Brandbasket: $marker"
  if grep -qF "# BEGIN $marker" "$file" 2>/dev/null; then say "  $file already has the $marker block"; return 0; fi
  say "  $file gets a new block: $marker"
  if (( APPLY )); then
    printf '\n# BEGIN %s\n%s\n# END %s\n' "$marker" "$content" "$marker" >> "$file"
  fi
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
