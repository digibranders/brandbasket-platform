#!/usr/bin/env bash
# Applies Payload's migrations to the Payload database (brandbasket_platform_payload), then fails unless every one has run.
#
# Run from the repository root, by the production deploy (brandbasket-platform-release on the VPS, from the release
# being deployed; see docs/deployment/brandbasket-vps.md) and by CI's database job. It reads
# DATABASE_URL_PAYLOAD and PAYLOAD_SECRET from apps/platform/.env.local, as `pnpm cms:migrate` always does; the
# connection there belongs to the role that owns the Payload database, so no sudo or owner password is involved.
#
# Two guards, because `payload migrate` cannot be trusted to fail loudly on its own:
#   - When it finds a database that was schema-pushed in development (a batch -1 row) it asks for confirmation.
#     With no terminal that prompt waits forever, even on /dev/null, so the command runs under a time limit.
#   - Answered "no", it exits 0 having applied nothing. So the result is read back from `payload migrate:status`.
# A deploy that carried on regardless would start new code against the old schema, which is how production lost its
# blog screens on 2026-09-29 (that deploy had no Payload step at all, but the effect is the same).
set -euo pipefail

# The Payload database is small; a real run takes seconds. Anything this long is the prompt above.
readonly MIGRATE_TIME_LIMIT=300s

# GNU coreutils, present on the server and on GitHub's Ubuntu runners. Without --foreground it signals the whole
# process group, so the node process pnpm started is stopped too, not left holding a database connection.
# Without it (a Mac has none) perl's alarm does the same job for the one process it starts.
if command -v timeout >/dev/null; then
  run_limited() { timeout "$MIGRATE_TIME_LIMIT" "$@"; }
elif command -v perl >/dev/null; then
  run_limited() { perl -e 'my $seconds = shift; $seconds =~ s/s$//; alarm $seconds; exec @ARGV or die "cannot run @ARGV: $!"' "$MIGRATE_TIME_LIMIT" "$@"; }
else
  echo "This script needs GNU 'timeout' (coreutils) or perl. Run 'pnpm cms:migrate' directly instead." >&2
  exit 1
fi

if ! run_limited pnpm cms:migrate </dev/null; then
  echo "payload migrate failed or waited on a prompt for $MIGRATE_TIME_LIMIT. If it reported a database pushed in" >&2
  echo "dev mode, that database needs a person to look at it: nothing has been applied." >&2
  exit 1
fi

# The status table, without colour codes. One row per migration file: `│ <name> │ <batch> │ Yes │` or `│ ... │ No │`.
status="$(pnpm -s cms:migrate:status </dev/null | sed 's/\x1b\[[0-9;]*m//g')"

applied="$(grep -cE '│ *[0-9]{8}_[0-9]{6} *│.*│ *Yes *│' <<<"$status" || true)"
pending="$(grep -E '│ *[0-9]{8}_[0-9]{6} *│.*│ *No *│' <<<"$status" || true)"

if [[ -n "$pending" ]]; then
  echo "Payload migrations are still pending after migrating:" >&2
  echo "$pending" >&2
  exit 1
fi

# Nothing pending but nothing applied either means the table was not read (its format changed, or the command
# printed an error instead). Every database has at least the first migration, so treat that as a failure too.
if [[ "$applied" -eq 0 ]]; then
  echo "Could not read Payload's migration status; refusing to report success. Output was:" >&2
  echo "$status" >&2
  exit 1
fi

echo "Payload migrations: all $applied applied."
