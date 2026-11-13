import { createDatabase, latestGscDay, listGa4Properties, listGscSites } from "@brandbasket/db";
import { requireEnv } from "@brandbasket/db/local-env";
import { loadCustomerEnv } from "./load-env";
import { createGa4Reader } from "@brandbasket/shared/server/ga4/client";
import { createTokenSource, loadServiceAccount } from "@brandbasket/shared/server/ga4/service-account";
import { realGa4Store } from "@brandbasket/shared/server/ga4/store";
import { runGa4Sync } from "@brandbasket/shared/server/ga4/sync";
import { createAccountTokenSource, withFallback } from "@brandbasket/shared/server/google/account-token";
import { GoogleAccessLost } from "@brandbasket/shared/server/google/oauth";
import { createGscReader } from "@brandbasket/shared/server/gsc/client";
import { realGscStore } from "@brandbasket/shared/server/gsc/store";
import { runGscSync } from "@brandbasket/shared/server/gsc/sync";

/*
 * `pnpm google:sync [--dry-run]`: pulls Google Analytics (daily visits, key events, channels, pages) and Search Console (daily
 * clicks, impressions, position, top searches and pages) for every business with a property or site on record, through the
 * Brandbasket Google account connected in the console (Settings, Google account). Numbers are stored as `ga4.*` and `gsc.*`
 * in metric_daily and as lists in metric_breakdowns. Reports and customer screens read the store, never Google.
 * brandbasket-google-sync.timer runs it nightly on the server (docs/deployment/brandbasket-vps.md, "Google").
 *
 * Analytics may fall back to the service account in GA4_SERVICE_ACCOUNT_JSON when the account is not connected; Search
 * Console never does. `--dry-run` lists what would be pulled and calls neither Google nor the database for writes.
 * A refused account stops the run and exits 1, so the unit's failure alert is seen.
 */
async function main(): Promise<void> {
  loadCustomerEnv();
  const dryRun = process.argv.includes("--dry-run");
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 2 });
  try {
    const [properties, sites] = await Promise.all([listGa4Properties(db), listGscSites(db)]);
    console.log(`Google: ${properties.length} Analytics properties, ${sites.length} Search Console sites on record.`);
    if (dryRun) {
      for (const site of sites) console.log(`  would pull Search Console for business ${site.businessId}, latest stored day ${(await latestGscDay(db, site.businessId)) ?? "none yet"}`);
      return;
    }
    if (properties.length === 0 && sites.length === 0) return;

    const account = createAccountTokenSource(db, {
      slot: 1,
      purpose: "read",
      authSecret: requireEnv("BETTER_AUTH_SECRET"),
      credentials: { clientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET") },
    });
    const servicePath = process.env.GA4_SERVICE_ACCOUNT_JSON;
    const analyticsToken = servicePath?.trim() ? withFallback(account, createTokenSource(await loadServiceAccount(servicePath))) : account;

    const now = new Date();
    let failed = false;
    if (properties.length > 0) {
      const report = await runGa4Sync(createGa4Reader(analyticsToken), realGa4Store(db), now);
      const quota = report.lowestDailyTokens === null ? "" : ` Lowest daily request budget left: ${report.lowestDailyTokens}.`;
      console.log(`Google Analytics: ${report.properties} properties, ${report.ok} pulled, ${report.accessLost} without access, ${report.failed} failed.${quota}`);
      for (const failure of report.failures) console.error(`Google Analytics pull failed for business ${failure.businessId}: ${failure.failure}`);
      failed ||= report.failed > 0;
    }
    if (sites.length > 0) {
      const report = await runGscSync(createGscReader(account), realGscStore(db), now);
      console.log(`Search Console: ${report.sites} sites, ${report.ok} pulled, ${report.accessLost} without access, ${report.failed} failed.`);
      for (const failure of report.failures) console.error(`Search Console pull failed for business ${failure.businessId}: ${failure.failure}`);
      failed ||= report.failed > 0;
    }
    // A site we cannot read is shown in the console; a pull that failed on our side fails the run so the alert is seen.
    if (failed) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof GoogleAccessLost) console.error(`Google sync stopped: ${error.message} Open Settings, Google account in the console and press Connect again.`);
  else console.error("Google sync failed", error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
