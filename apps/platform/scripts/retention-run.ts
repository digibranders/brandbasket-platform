import { parseArgs } from "node:util";
import { countExpiredRetention, createDatabase, purgeExpiredRetention } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { retentionReport } from "../lib/retention-report";

/*
 * `pnpm retention:run [--dry-run]`: removes what has only a technical life and has run out (sessions, reset and
 * confirmation tokens, rate-limit windows, account codes). See packages/db/src/queries/retention.ts. The nightly support
 * maintenance runs the same purge; this is for running it by hand, and for previewing it with --dry-run.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
  const dryRun = values["dry-run"] === true;
  loadLocalEnv();
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    const now = new Date();
    const counts = dryRun ? await countExpiredRetention(db, now) : await purgeExpiredRetention(db, now);
    console.log(retentionReport(counts, dryRun));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("Retention run failed", error);
  process.exitCode = 1;
});
