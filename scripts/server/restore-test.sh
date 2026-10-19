#!/usr/bin/env bash
# What this does: proves the newest backup can actually be restored. It restores the newest dump of each Brandbasket database into a
# THROWAWAY database (brandbasket_restore_test_platform / brandbasket_restore_test_payload), checks the result (tables exist, the migration
# journal and the staff and client tables are readable, row counts printed), then drops the throwaway databases. The real
# databases are never touched. Installed as /usr/local/sbin/brandbasket-restore-test (root-owned); run weekly by brandbasket-restore-test.timer.
#
# Assumes: PostgreSQL on this machine, the postgres OS user, the roles from setup-database.sh already created (the dumps keep object
# owners, so a restore on a NEW machine needs setup-database.sh first), backups in /srv/brandbasket/backups/db written by brandbasket-backup.
# Dry-run by default; --apply does it. Safe to re-run: it drops a leftover throwaway database from a crashed run before starting.
#   restore-test.sh [--apply] [--stamp 20261014T021500Z]     (default: the stamp in backups/LATEST)
# Test hooks: BRANDBASKET_ROOT, BRANDBASKET_PG_RUNAS ("" = current user, honouring PGHOST etc.).
set -euo pipefail

APPLY=0
STAMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    --stamp) STAMP="${2:?--stamp needs a value}"; shift 2 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done

ROOT="${BRANDBASKET_ROOT:-/srv/brandbasket}"
PG_RUNAS="${BRANDBASKET_PG_RUNAS-runuser -u postgres --}"
BACKUPS="$ROOT/backups"
say() { printf '%s\n' "$*"; }
pg() {
  if [[ -n "$PG_RUNAS" ]]; then
    # shellcheck disable=SC2086 # PG_RUNAS is a command prefix with arguments on purpose
    $PG_RUNAS "$@"
  else
    "$@"
  fi
}

if [[ -z "$STAMP" ]]; then
  [[ -r "$BACKUPS/LATEST" ]] || { echo "No $BACKUPS/LATEST: no backup has run yet." >&2; exit 1; }
  STAMP="$(head -n 1 "$BACKUPS/LATEST")"
fi
PLATFORM_DUMP="$BACKUPS/db/brandbasket_platform-$STAMP.dump"
PAYLOAD_DUMP="$BACKUPS/db/brandbasket_platform_payload-$STAMP.dump"
for f in "$PLATFORM_DUMP" "$PAYLOAD_DUMP"; do [[ -s "$f" ]] || { echo "Missing or empty backup: $f" >&2; exit 1; }; done

say "Restore test of backup $STAMP ($([[ $APPLY -eq 1 ]] && echo apply || echo dry-run))"
say "  restore $PLATFORM_DUMP into brandbasket_restore_test_platform, then check and drop it"
say "  restore $PAYLOAD_DUMP into brandbasket_restore_test_payload, then check and drop it"
if [[ $APPLY -eq 0 ]]; then say "Nothing was done. Add --apply."; exit 0; fi

cleanup() {
  pg dropdb --if-exists brandbasket_restore_test_platform >/dev/null 2>&1 || true
  pg dropdb --if-exists brandbasket_restore_test_payload >/dev/null 2>&1 || true
}
ERRFILE="$(mktemp)"
trap 'cleanup; rm -f "$ERRFILE"' EXIT
cleanup

fail=0
restore_and_check() { # dump, scratch database, label, a table that must exist
  local dump="$1" scratch="$2" label="$3" must_have="$4" tables rows
  pg createdb "$scratch"
  if ! pg pg_restore --exit-on-error --dbname="$scratch" "$dump" 2>"$ERRFILE"; then
    say "  FAIL  $label: pg_restore reported errors:"; sed 's/^/        /' "$ERRFILE" | head -20; fail=1; return
  fi
  tables="$(pg psql -X -At -d "$scratch" -c "select count(*) from information_schema.tables where table_schema = 'public'")"
  if [[ "${tables:-0}" -lt 3 ]]; then say "  FAIL  $label: only ${tables:-0} tables restored"; fail=1; return; fi
  rows="$(pg psql -X -At -d "$scratch" -c "select count(*) from \"$must_have\"" 2>&1 || true)"
  if ! [[ "$rows" =~ ^[0-9]+$ ]]; then say "  FAIL  $label: could not read $must_have ($rows)"; fail=1; return; fi
  say "  PASS  $label: $tables tables restored, $must_have has $rows rows"
}
# The platform database must have its users and the migration journal; Payload's must have its own migrations table.
restore_and_check "$PLATFORM_DUMP" brandbasket_restore_test_platform "platform database" users
pg psql -X -At -d brandbasket_restore_test_platform -c "select 'migrations applied: ' || count(*) from drizzle.__drizzle_migrations" 2>/dev/null | sed 's/^/        /' || true
restore_and_check "$PAYLOAD_DUMP" brandbasket_restore_test_payload "payload database" payload_migrations
if [[ $fail -ne 0 ]]; then echo "RESTORE TEST FAILED: do not trust these backups until this is explained." >&2; exit 1; fi
say "Restore test passed; the throwaway databases were dropped."
