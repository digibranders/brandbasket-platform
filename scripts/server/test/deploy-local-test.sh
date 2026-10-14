#!/usr/bin/env bash
# What this does: rehearses scripts/server/deploy.sh entirely on this machine, with no server and no network. It builds a
# tiny fake source tree, uses a temporary directory as the "server" (--local-root), and puts fake `sudo`, `systemctl`,
# `curl` and `pnpm` on PATH, so the real rsync / symlink / health-check / rollback / prune logic is what runs.
# Proves: dry-run changes nothing; a first and second deploy; a failed health check rolls every app back; a failed
# migration and a failed env check stop before any switch; --rollback and --list; pruning to 5 releases.
# Assumes: bash, rsync, git-free (it deploys with --source). Safe: everything lives under one mktemp -d directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$HERE/../deploy.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/fynix-deploy-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
SERVER="$WORK/server"; SHIMS="$WORK/shims"; TREE="$WORK/tree"
mkdir -p "$SERVER/shared" "$SHIMS" "$TREE/apps/platform/.next" "$TREE/apps/admin/.next" "$TREE/scripts"
: > "$SERVER/shared/platform.env.local"; : > "$SERVER/shared/admin.env.local"
echo '{"name":"fake"}' > "$TREE/package.json"
echo 'built' > "$TREE/apps/platform/.next/BUILD_ID"; echo 'built' > "$TREE/apps/admin/.next/BUILD_ID"
# Things the build leaves that MUST travel (links to externals inside .next/node_modules) and things that must NOT (dependencies, secrets, caches).
mkdir -p "$TREE/apps/admin/.next/node_modules" "$TREE/apps/admin/.next/cache" "$TREE/apps/platform/node_modules/left-pad" "$TREE/node_modules/.pnpm"
ln -s ../../../../node_modules/.pnpm/pg@8/node_modules/pg "$TREE/apps/admin/.next/node_modules/pg-abc123"
echo secret > "$TREE/apps/platform/.env.local"; echo x > "$TREE/apps/admin/.next/cache/blob"
# The Payload step of a release: succeeds unless the marker says otherwise.
cat > "$TREE/scripts/cms-migrate.sh" <<'CMS'
#!/usr/bin/env bash
echo "cms-migrate ran in $(basename "$PWD")" >> "$FAKE_LOG"
[ ! -e "$FAKE_STATE/cms-fails" ]
CMS
FAKE_LOG="$WORK/calls.log"; FAKE_STATE="$WORK/state"; mkdir -p "$FAKE_STATE"; : > "$FAKE_LOG"
export FAKE_LOG FAKE_STATE FAKE_SERVER="$SERVER"

cat > "$SHIMS/sudo" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" = "-n" ] && shift
exec "$@"
SH
cat > "$SHIMS/systemctl" <<'SH'
#!/usr/bin/env bash
echo "systemctl $*" >> "$FAKE_LOG"
SH
# curl: answers 200 unless the release the app currently points at contains a BROKEN file for that app.
cat > "$SHIMS/curl" <<'SH'
#!/usr/bin/env bash
url="${*: -1}"
case "$url" in *:3001/*) app=platform ;; *:3003/*) app=admin ;; *) echo 000; exit 0 ;; esac
if [ -e "$FAKE_SERVER/current-$app/apps/$app/BROKEN" ]; then echo 500; else echo 200; fi
SH
cat > "$SHIMS/pnpm" <<'SH'
#!/usr/bin/env bash
echo "pnpm $*" >> "$FAKE_LOG"
if [ "${1:-}" = env:check ] && [ -e "$FAKE_STATE/envcheck-fails" ]; then echo "error: BREVO_API_KEY is not set" >&2; exit 1; fi
exit 0
SH
cat > "$WORK/migrate-shim" <<'SH'
#!/usr/bin/env bash
echo "fynix-migrate ran for $(basename "$(readlink "$FAKE_SERVER/deploying")")" >> "$FAKE_LOG"
[ ! -e "$FAKE_STATE/migrate-fails" ]
SH
chmod +x "$SHIMS"/* "$WORK/migrate-shim" "$TREE/scripts/cms-migrate.sh"

export PATH="$SHIMS:$PATH" FYNIX_MIGRATE_CMD="$WORK/migrate-shim" FYNIX_HEALTH_TRIES=2 FYNIX_HEALTH_PAUSE=0

failures=0
check() { # description, command...
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then printf '  PASS  %s\n' "$what"; else printf '  FAIL  %s\n' "$what"; failures=$((failures + 1)); fi
}
run() { bash "$DEPLOY" --local-root "$SERVER" --source "$TREE" --yes --keep 5 "$@"; }
points() { [ "$(basename "$(readlink "$SERVER/current-$1")")" = "$2" ] || [[ "$(basename "$(readlink "$SERVER/current-$1")")" == *"$2" ]]; }
section() { printf '\n== %s\n' "$*"; }

section "1. dry-run changes nothing"
run --sha aaaa111 | sed 's/^/    /'
check "no releases directory was created" test ! -e "$SERVER/releases"
check "no calls were made" test ! -s "$FAKE_LOG"

section "2. first deploy"
run --apply --sha aaaa111 | sed 's/^/    /'
check "release exists" bash -c "ls '$SERVER/releases' | grep -q aaaa111"
check "env file linked into the release" bash -c "test -L '$SERVER/releases/'*aaaa111/apps/platform/.env.local"
rel="$(ls -d "$SERVER"/releases/*aaaa111)"
check "no dependency folders were uploaded" bash -c "[ ! -e '$rel/node_modules' ] && [ ! -e '$rel/apps/platform/node_modules' ]"
check "no real .env file was uploaded (the linked one is a symlink)" bash -c "[ -L '$rel/apps/platform/.env.local' ] && [ ! -e '$rel/apps/admin/.next/cache' ]"
check ".next/node_modules (the build's links to externals) DID travel, links intact" bash -c "test -L '$SERVER/releases/'*aaaa111/apps/admin/.next/node_modules/pg-abc123"
check "platform points at it" points platform aaaa111
check "admin points at it" points admin aaaa111
check "migrations ran before the restarts" bash -c "awk '/fynix-migrate ran/{m=NR} /systemctl restart/{if(!r)r=NR} END{exit !(m && r && m<r)}' '$FAKE_LOG'"
check "restarted app then admin, one at a time" bash -c "grep 'systemctl restart' '$FAKE_LOG' | head -2 | tr '\n' ' ' | grep -q 'fynix-app.*fynix-admin'"
sleep 1

section "3. second deploy"
run --apply --sha bbbb222 | sed 's/^/    /'
check "both apps moved to bbbb222" bash -c "[[ \$(readlink '$SERVER/current-platform') == *bbbb222 && \$(readlink '$SERVER/current-admin') == *bbbb222 ]]"
sleep 1

section "4. a release whose admin never answers: automatic rollback"
touch "$TREE/apps/admin/BROKEN"
if run --apply --sha cccc333 2>&1 | sed 's/^/    /'; then :; fi
rm -f "$TREE/apps/admin/BROKEN"
check "platform is back on bbbb222" bash -c "[[ \$(readlink '$SERVER/current-platform') == *bbbb222 ]]"
check "admin is still on bbbb222" bash -c "[[ \$(readlink '$SERVER/current-admin') == *bbbb222 ]]"
check "the failed release is kept for a look" bash -c "ls '$SERVER/releases' | grep -q cccc333"
sleep 1

section "5. a failing migration stops before any switch"
touch "$FAKE_STATE/migrate-fails"
if run --apply --sha dddd444 2>&1 | sed 's/^/    /'; then :; fi
rm -f "$FAKE_STATE/migrate-fails"
check "apps unchanged (still bbbb222)" bash -c "[[ \$(readlink '$SERVER/current-platform') == *bbbb222 && \$(readlink '$SERVER/current-admin') == *bbbb222 ]]"
sleep 1

section "6. a failing Payload migration also stops"
touch "$FAKE_STATE/cms-fails"
if run --apply --sha eeee555 2>&1 | sed 's/^/    /'; then :; fi
rm -f "$FAKE_STATE/cms-fails"
check "apps unchanged (still bbbb222)" bash -c "[[ \$(readlink '$SERVER/current-platform') == *bbbb222 ]]"
sleep 1

section "7. an incomplete environment stops before migrating"
: > "$FAKE_LOG"; touch "$FAKE_STATE/envcheck-fails"
if run --apply --sha ffff666 2>&1 | sed 's/^/    /'; then :; fi
rm -f "$FAKE_STATE/envcheck-fails"
check "no migration was attempted" bash -c "! grep -q 'fynix-migrate ran' '$FAKE_LOG'"
sleep 1

section "8. --list and --rollback"
run --list | sed 's/^/    /'
target="$(ls -1 "$SERVER/releases" | grep aaaa111)"
run --apply --rollback "$target" | sed 's/^/    /'
check "both apps are back on aaaa111" bash -c "[[ \$(readlink '$SERVER/current-platform') == *aaaa111 && \$(readlink '$SERVER/current-admin') == *aaaa111 ]]"
run --apply --rollback "$target" --app admin >/dev/null
if run --apply --rollback no-such-release 2>&1 | sed 's/^/    /'; then :; fi
check "a missing release leaves the apps where they were" bash -c "[[ \$(readlink '$SERVER/current-platform') == *aaaa111 ]]"
sleep 1

section "9. pruning keeps the newest 5 (and what is running)"
for sha in g1 g2 g3 g4 g5 g6; do sleep 1; run --apply --sha "$sha" >/dev/null; done
count="$(ls -1 "$SERVER/releases" | grep -vc '\.partial$')"
check "5 releases remain (found $count)" test "$count" -eq 5
check "no .partial directories are left" bash -c "! ls '$SERVER/releases' | grep -q partial"
check "the running release still exists" test -d "$SERVER/current-platform"
run --list | sed 's/^/    /'

echo
if [[ $failures -eq 0 ]]; then echo "ALL CHECKS PASSED"; else echo "$failures CHECK(S) FAILED"; exit 1; fi
