import { createDatabase } from "../src/client";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { backfillDirectoryPlaces } from "../src/queries/directory-place-backfill";
import { formatBackfillReport } from "./directory-place-backfill-report";

/*
 * Fills place_id on every directory table from the listing keys rows were written with (migration 0077), on the staff
 * connection, in one transaction. `pnpm directory:import-places` MUST run first: before the open-data places exist the
 * backfill would give clients and owner-added businesses fresh places at open-data addresses, and the import would
 * then refuse the ledger for good, so it refuses to start instead. Running it again changes nothing; rows written by
 * key since the last run are picked up and merged.
 * It refuses, changing nothing, when two approved claims or two client listings would share one business: staff
 * resolve those first. Read-only checks to run beforehand: scripts/preflight-directory-place-ids.sql.
 * It waits at most 5 seconds for its table locks: if a long transaction holds one of the tables, it fails with
 * "canceling statement due to lock timeout" and writes nothing; run it again.
 * `pnpm directory:import-places` runs this itself once the ledger is in. Until it has run, the platform still reads a
 * place's rows written by one of its legacy keys (./directory-refs matchesDirectoryLookup); run it again after deploying
 * a platform from before Task 7, so the rows that platform wrote by key get their place too.
 *
 *   pnpm directory:backfill-places
 */

async function main(): Promise<void> {
  loadLocalEnv();
  // The registry is staff-only (0076), like every table this fills.
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    console.log(formatBackfillReport(await backfillDirectoryPlaces(db, new Date())));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
