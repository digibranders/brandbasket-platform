#!/usr/bin/env bash
# What this does: ships the current commit of this repository to the Fynix droplet, safely, from the operator's machine
# (a Mac or Linux box with node, pnpm, git, rsync and ssh). Nothing here depends on GitHub Actions.
#
#   deploy.sh --host deploy@DROPLET                  show the plan (dry-run: touches nothing, not even the network)
#   deploy.sh --host deploy@DROPLET --apply          do it
#   deploy.sh --host deploy@DROPLET --rollback REL   put both apps back on release REL (see --list); --app platform|admin for one
#   deploy.sh --host deploy@DROPLET --list           releases on the server, and which one each app runs
#
# The steps, in order, and where a failure stops:
#   1. build   a clean export of HEAD (git archive, so no .env files and no uncommitted change) is installed and built here with
#              the production NEXT_PUBLIC values from deploy/build.env. The droplet never builds (a 2 GB box cannot).
#   2. upload  rsync to /srv/fynix/releases/<release>.partial, renamed to <release> only when complete; links the shared env files.
#   3. install `pnpm install --frozen-lockfile` in the release on the server (native modules for the server's own platform).
#   4. check   `pnpm env:check` on the server's two env files: a missing key stops the deploy BEFORE anything changes.
#   5. migrate fynix-migrate (main DB, as its owner, through sudo) then scripts/cms-migrate.sh (Payload's DB). Still before the
#              switch: the old code keeps serving while the schema moves, so migrations must work with the previous release.
#   6. switch  current-platform then current-admin are pointed at the release and each service restarted ONE AT A TIME; each must
#              answer /login within 90 s. If any does not, every app already switched goes back to the release it ran before.
#   7. prune   the newest 5 releases are kept (and anything a symlink points at).
#
# Assumes on the server: the layout of docs/deployment/fynix-droplet.md (the deploy user, /srv/fynix, the systemd units
# fynix-app and fynix-admin, /usr/local/sbin/fynix-migrate, a sudoers rule for exactly those two commands).
# Never contacts any server unless you pass --apply (or --list/--status, which only read). The address is always a parameter.
#
# The two public hostnames only matter for the health check (the Host header sent to 127.0.0.1); the defaults below are the
# repository's (app.* and console.*). If the real names differ, pass --app-host and --admin-host.
# Test hooks: --local-root DIR acts on a directory on this machine instead of over ssh (used by
# scripts/server/test/deploy-local-test.sh); --source DIR deploys that tree instead of `git archive HEAD`; --skip-build.
set -euo pipefail

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; }

HOST=""
LOCAL_ROOT=""
ROOT="/srv/fynix"
SOURCE=""
SHA=""
APPLY=0
YES=0
SKIP_BUILD=0
SKIP_INSTALL=0
ALLOW_DIRTY=0
KEEP=5
MODE="deploy"
ROLLBACK_TO=""
ROLLBACK_APP="both"
SSH_OPTS="${FYNIX_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"
APP_HOST="app.fynix.digital"
ADMIN_HOST="console.fynix.digital"
APP_PORT=3001
ADMIN_PORT=3003
HEALTH_TRIES="${FYNIX_HEALTH_TRIES:-45}"
HEALTH_PAUSE="${FYNIX_HEALTH_PAUSE:-2}"
MIGRATE_CMD="${FYNIX_MIGRATE_CMD:-sudo -n /usr/local/sbin/fynix-migrate}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    --local-root) LOCAL_ROOT="${2:?--local-root needs a directory}"; shift 2 ;;
    --root) ROOT="${2:?--root needs a path}"; shift 2 ;;
    --source) SOURCE="${2:?--source needs a directory}"; shift 2 ;;
    --sha) SHA="${2:?--sha needs a value}"; shift 2 ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift 2 ;;
    --app-host) APP_HOST="${2:?--app-host needs a hostname}"; shift 2 ;;
    --admin-host) ADMIN_HOST="${2:?--admin-host needs a hostname}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --yes) YES=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --list) MODE="list"; shift ;;
    --status) MODE="list"; shift ;;
    --rollback) MODE="rollback"; ROLLBACK_TO="${2:?--rollback needs a release name}"; shift 2 ;;
    --app) ROLLBACK_APP="${2:?--app needs platform, admin or both}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done

if [[ -z "$HOST" && -z "$LOCAL_ROOT" ]]; then echo "Say where: --host deploy@ADDRESS (or --local-root DIR for a rehearsal)." >&2; exit 64; fi
if [[ -n "$LOCAL_ROOT" ]]; then ROOT="$LOCAL_ROOT"; fi
if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [[ "$KEEP" -lt 2 ]]; then echo "--keep must be a number of at least 2." >&2; exit 64; fi
case "$ROLLBACK_APP" in platform | admin | both) ;; *) echo "--app must be platform, admin or both." >&2; exit 64 ;; esac

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- reaching the server ---------------------------------------------------------------------------------------------------
# Every remote step is a small script on standard input, run by bash on the server (over ssh) or here (--local-root), so the
# very same text is what the rehearsal proves.
remote() {
  if [[ -n "$LOCAL_ROOT" ]]; then bash -s; else
    # shellcheck disable=SC2086 # SSH_OPTS is a list of options on purpose
    ssh $SSH_OPTS "$HOST" bash -s
  fi
}
target() { if [[ -n "$LOCAL_ROOT" ]]; then printf '%s' "$LOCAL_ROOT"; else printf '%s:%s' "$HOST" "$ROOT"; fi; }

# The shared prelude of every remote script: strict mode and the paths.
prelude() {
  cat <<PRELUDE
set -euo pipefail
ROOT='$ROOT'
PRELUDE
}

# --- --list ----------------------------------------------------------------------------------------------------------------
list_releases() {
  { prelude; cat <<'LIST'
cd "$ROOT" 2>/dev/null || { echo "no $ROOT on the server yet"; exit 0; }
plat="$(readlink current-platform 2>/dev/null || true)"; adm="$(readlink current-admin 2>/dev/null || true)"
echo "platform runs: ${plat:-none}"; echo "admin runs:    ${adm:-none}"
for r in $(ls -1 releases 2>/dev/null | grep -v '\.partial$' | sort -r); do
  mark=""
  [ "$plat" = "$ROOT/releases/$r" ] && mark="$mark platform"
  [ "$adm" = "$ROOT/releases/$r" ] && mark="$mark admin"
  echo "  $r${mark:+   <- $mark}"
done
LIST
  } | remote
}

# --- switching an app to a release, with a health check ---------------------------------------------------------------------
# Prints "PREV=<path>" for the release the app ran before, then restarts it and waits for /login. Exit 1 if it never answers.
switch_app() { # app release
  local app="$1" release="$2" unit host port
  if [[ "$app" == platform ]]; then unit=fynix-app; host="$APP_HOST"; port="$APP_PORT"; else unit=fynix-admin; host="$ADMIN_HOST"; port="$ADMIN_PORT"; fi
  { prelude; cat <<SWITCH
app='$app'; unit='$unit'; host='$host'; port='$port'; release='$release'
target="\$ROOT/releases/\$release"
[ -d "\$target" ] || { echo "no such release: \$release" >&2; exit 2; }
prev="\$(readlink "\$ROOT/current-\$app" 2>/dev/null || true)"
echo "PREV=\$prev"
ln -sfn "\$target" "\$ROOT/current-\$app"
sudo -n systemctl restart "\$unit"
i=0
while [ "\$i" -lt $HEALTH_TRIES ]; do
  code="\$(curl -s -o /dev/null -w '%{http_code}' -H "Host: \$host" "http://127.0.0.1:\$port/login" || true)"
  if [ "\$code" = 200 ]; then echo "HEALTHY \$app \$release"; exit 0; fi
  i=\$((i + 1)); sleep $HEALTH_PAUSE
done
echo "UNHEALTHY \$app \$release (last answer: \${code:-none})" >&2
exit 1
SWITCH
  } | remote
}

# Puts an app back on `previous` (a full path recorded by switch_app). Best effort: reports, never stops the caller.
restore_app() { # app previous
  local app="$1" previous="$2"
  if [[ -z "$previous" ]]; then say "  $app: it had no previous release to go back to."; return 0; fi
  say "  $app: going back to $(basename "$previous")"
  if switch_app "$app" "$(basename "$previous")" >/dev/null; then say "  $app: back and answering."; else say "  $app: WENT BACK BUT DID NOT ANSWER. Look at: journalctl -u fynix-$([[ $app == platform ]] && echo app || echo admin) -n 80"; fi
}

# --- --rollback ------------------------------------------------------------------------------------------------------------
rollback() {
  local apps=() app out prev switched=()
  if [[ "$ROLLBACK_APP" == both ]]; then apps=(platform admin); else apps=("$ROLLBACK_APP"); fi
  say "Rollback to $ROLLBACK_TO for: ${apps[*]} (on $(target))"
  if [[ $APPLY -eq 0 ]]; then say "[dry-run] would point current-${apps[*]} at releases/$ROLLBACK_TO and restart each, one at a time, with a /login check. Add --apply."; return 0; fi
  for app in "${apps[@]}"; do
    if out="$(switch_app "$app" "$ROLLBACK_TO")"; then
      prev="$(printf '%s\n' "$out" | sed -n 's/^PREV=//p')"; switched+=("$app=$prev"); say "  $app: $(printf '%s\n' "$out" | grep HEALTHY)"
    else
      say "  $app did not answer on $ROLLBACK_TO."
      prev="$(printf '%s\n' "$out" | sed -n 's/^PREV=//p')"
      restore_app "$app" "$prev"
      local pair; for pair in "${switched[@]:-}"; do [[ -n "$pair" ]] && restore_app "${pair%%=*}" "${pair#*=}"; done
      die "rollback failed; apps were put back as they were."
    fi
  done
  say "Rolled back."
}

# --- the deploy ------------------------------------------------------------------------------------------------------------
release_id() {
  local stamp short
  stamp="$(date -u +%Y%m%d%H%M%S)"
  if [[ -n "$SHA" ]]; then short="$SHA"; else short="$(git -C "$REPO" rev-parse --short=10 HEAD)"; fi
  printf '%s-%s' "$stamp" "$short"
}

build_here() { # builddir release
  local dir="$1" release="$2"
  [[ -f "$REPO/deploy/build.env" ]] || die "deploy/build.env is missing: copy deploy/build.env.example and fill the public values."
  say "== 1/7 build (clean export of HEAD, in $dir)"
  git -C "$REPO" archive HEAD | tar -x -C "$dir"
  # The public values (origins) are the only real settings a build needs; everything else is a placeholder that satisfies
  # the schemas and connects to nothing (the same approach CI takes).
  set -a
  # shellcheck disable=SC1091
  . "$REPO/deploy/build.env"
  set +a
  (
    cd "$dir"
    export NODE_ENV=production NEXT_DEPLOYMENT_ID="$release" NEXT_TELEMETRY_DISABLED=1
    export DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" DATABASE_URL_STAFF="postgresql://build:build@127.0.0.1:5432/build"
    export DATABASE_URL_PAYLOAD="postgresql://build:build@127.0.0.1:5432/build" DATABASE_URL_PUBLIC="postgresql://build:build@127.0.0.1:5432/build"
    export PAYLOAD_SECRET="build-placeholder-not-a-real-secret-0000" BETTER_AUTH_SECRET="build-placeholder-not-a-real-secret-0000"
    pnpm install --frozen-lockfile
    pnpm --filter @fynix/platform build
    pnpm --filter @fynix/admin build
  )
}

confirm() {
  [[ $YES -eq 1 ]] && return 0
  read -r -p "Deploy $1 to $(target)? [y/N] " answer
  [[ "$answer" == y || "$answer" == Y ]] || die "not confirmed."
}

deploy() {
  local release dir tree switched=() app out prev
  release="$(release_id)"
  if [[ -z "$SOURCE" && $ALLOW_DIRTY -eq 0 && $SKIP_BUILD -eq 0 && -n "$(git -C "$REPO" status --porcelain)" ]]; then
    say "note: you have uncommitted changes. They are NOT deployed (the build is a clean export of HEAD); commit first, or pass --allow-dirty to silence this."
  fi
  say "Release $release -> $(target)"
  say "  app       https://$APP_HOST   (fynix-app :$APP_PORT)"
  say "  admin     https://$ADMIN_HOST   (fynix-admin :$ADMIN_PORT)"
  if [[ $APPLY -eq 0 ]]; then
    cat <<PLAN
[dry-run] would, in order:
  1. build a clean export of HEAD here with deploy/build.env            (skipped with --skip-build or --source)
  2. rsync it to $ROOT/releases/$release.partial, then rename it; link the shared env files
  3. pnpm install --frozen-lockfile in the release, on the server
  4. pnpm env:check on $ROOT/shared/platform.env.local and admin.env.local
  5. migrate: $MIGRATE_CMD   then   bash scripts/cms-migrate.sh
  6. switch current-platform, restart fynix-app, wait for /login; then the same for current-admin / fynix-admin
     (on any failure every app already switched goes back to the release it ran before)
  7. keep the newest $KEEP releases
Nothing was done. Add --apply to do it.
PLAN
    return 0
  fi
  confirm "$release"

  if [[ -n "$SOURCE" ]]; then tree="$SOURCE"; say "== 1/7 build: skipped, deploying $SOURCE as it is"
  elif [[ $SKIP_BUILD -eq 1 ]]; then die "--skip-build needs --source DIR (a tree that is already built)."
  else dir="$(mktemp -d "${TMPDIR:-/tmp}/fynix-build.XXXXXX")"; tree="$dir"; build_here "$dir" "$release"; fi
  [[ -d "$tree/apps/platform/.next" && -d "$tree/apps/admin/.next" ]] || die "$tree has no built apps (apps/*/.next)."

  say "== 2/7 upload"
  { prelude; cat <<PREP
[ ! -e "\$ROOT/releases/$release" ] || { echo "release $release already exists" >&2; exit 1; }
mkdir -p "\$ROOT/releases" "\$ROOT/shared" "\$ROOT/releases/$release.partial"
PREP
  } | remote
  if [[ -n "$LOCAL_ROOT" ]]; then
    rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$tree"/ "$ROOT/releases/$release.partial"/
  else
    # shellcheck disable=SC2086
    rsync -az --delete "${RSYNC_EXCLUDES[@]}" -e "ssh $SSH_OPTS" "$tree"/ "$HOST:$ROOT/releases/$release.partial"/
  fi
  { prelude; cat <<FINAL
mv "\$ROOT/releases/$release.partial" "\$ROOT/releases/$release"
R="\$ROOT/releases/$release"
ln -sfn "\$ROOT/shared/platform.env.local" "\$R/apps/platform/.env.local"
ln -sfn "\$ROOT/shared/admin.env.local" "\$R/apps/admin/.env.local"
echo "uploaded \$R"
FINAL
  } | remote

  say "== 3/7 install on the server"
  if [[ $SKIP_INSTALL -eq 1 ]]; then say "  skipped (--skip-install)"; else
    { prelude; echo "cd \"\$ROOT/releases/$release\" && unset NODE_ENV && pnpm install --frozen-lockfile"; } | remote
  fi

  say "== 4/7 check the environment"
  if ! { prelude; echo "cd \"\$ROOT/releases/$release\" && pnpm env:check --platform \"\$ROOT/shared/platform.env.local\" --admin \"\$ROOT/shared/admin.env.local\""; } | remote; then
    die "the server's environment files are not ready (above). Nothing was changed; fix them and run again. The uploaded release $release is kept."
  fi

  say "== 5/7 migrate (before the switch)"
  if ! { prelude; cat <<MIG
ln -sfn "\$ROOT/releases/$release" "\$ROOT/deploying"
$MIGRATE_CMD
cd "\$ROOT/releases/$release" && bash scripts/cms-migrate.sh
MIG
  } | remote; then
    die "a migration failed. Nothing was switched: both apps still run their previous release. Migrations that did run stay applied."
  fi

  say "== 6/7 switch, one app at a time"
  for app in platform admin; do
    if out="$(switch_app "$app" "$release")"; then
      prev="$(printf '%s\n' "$out" | sed -n 's/^PREV=//p')"; switched+=("$app=$prev"); say "  $(printf '%s\n' "$out" | grep HEALTHY)"
    else
      prev="$(printf '%s\n' "$out" | sed -n 's/^PREV=//p')"
      say "  $app did not answer on $release. Rolling back."
      restore_app "$app" "$prev"
      local pair; for pair in "${switched[@]:-}"; do [[ -n "$pair" ]] && restore_app "${pair%%=*}" "${pair#*=}"; done
      die "deploy of $release failed at $app and was rolled back. The release stays on the server for a look: $ROOT/releases/$release"
    fi
  done

  say "== 7/7 prune (keep the newest $KEEP)"
  { prelude; cat <<PRUNE
cd "\$ROOT"
echo "$release" >> releases/.history
protected="\$(readlink current-platform 2>/dev/null || true) \$(readlink current-admin 2>/dev/null || true)"
total="\$(ls -1 releases | grep -v '\\.partial\$' | wc -l | tr -d ' ')"
remove=\$((total - $KEEP))
for r in \$(ls -1 releases | grep -v '\\.partial\$' | sort); do
  [ "\$remove" -gt 0 ] || break
  case " \$protected " in *" \$ROOT/releases/\$r "*) continue ;; esac
  rm -rf "releases/\$r"; echo "removed old release \$r"; remove=\$((remove - 1))
done
rm -f deploying
PRUNE
  } | remote
  say "Deployed $release. Smoke test: docs/deployment/fynix-droplet.md, section 14."
}

# What never goes to the server: dependencies (installed there; only the TOP-level node_modules folders are excluded, because each
# app's built `.next/node_modules` holds the links the build made to its externals and must travel with it), secrets, caches, dev files.
RSYNC_EXCLUDES=(--exclude /node_modules --exclude '/apps/*/node_modules' --exclude '/packages/*/node_modules' --exclude /.git
  --exclude '.env*' --exclude .data --exclude '/apps/*/.next/cache' --exclude '/apps/*/.next/dev'
  --exclude '*.tsbuildinfo' --exclude .turbo --exclude /docs --exclude /.github)

case "$MODE" in
  list) list_releases ;;
  rollback) rollback ;;
  deploy) deploy ;;
esac
