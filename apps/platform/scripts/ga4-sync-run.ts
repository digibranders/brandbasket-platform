import { createDatabase } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { createGa4Reader } from "@brandbasket/shared/server/ga4/client";
import { createTokenSource, loadServiceAccount } from "@brandbasket/shared/server/ga4/service-account";
import { realGa4Store } from "@brandbasket/shared/server/ga4/store";
import { runGa4Sync } from "@brandbasket/shared/server/ga4/sync";

/*
 * `pnpm ga4:sync`: pulls the daily visits, the month's channels and pages and the key events from Google Analytics for every
 * business whose property staff set in the console, and stores them as `ga4.*` numbers and `ga4` lists. The customer's
 * Website screen reads them when CUSTOMER_VISITS_ENABLED is on. brandbasket-ga4-sync.timer runs it nightly on the server
 * (docs/deployment/brandbasket-vps.md, "Google Analytics"). It needs GA4_SERVICE_ACCOUNT_JSON: the path of the key file of the
 * service account customers add as a Viewer on their property. The key is read from that file only.
 */
async function main(): Promise<void> {
  loadLocalEnv();
  const account = await loadServiceAccount(process.env.GA4_SERVICE_ACCOUNT_JSON);
  const token = createTokenSource(account);
  // A bad key fails the whole run here, loudly, instead of being written as a failed pull for every business.
  await token();
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 2 });
  try {
    const report = await runGa4Sync(createGa4Reader(token), realGa4Store(db), new Date());
    console.log(`Google Analytics: ${report.properties} properties, ${report.ok} pulled, ${report.accessLost} without access, ${report.failed} failed.`);
    for (const failure of report.failures) console.error(`Google Analytics pull failed for business ${failure.businessId}: ${failure.failure}`);
    // A property we cannot read is the customer's to fix and is shown in the console; a pull that failed on our side fails the run so the alert is seen.
    if (report.failed > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("Google Analytics sync failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
