import { createDatabase } from "@brandbasket/db";
import { requireEnv } from "@brandbasket/db/local-env";
import { loadCustomerEnv } from "./load-env";
import { createAppEmailTransport, emailTeamInboxDefault } from "@brandbasket/email";
import { runSiteHealth } from "@brandbasket/shared/server/site-health";

/*
 * `pnpm site-health:run`: checks every live customer website once (uptime, certificate end date, and at most once a day the
 * phone speed from PageSpeed Insights) and stores one site_checks row per site. A site that goes from up to down for two
 * checks in a row emails the team mailbox once. brandbasket-site-health.timer runs it every 10 minutes on the server
 * (docs/deployment/brandbasket-vps.md). PAGESPEED_API_KEY is optional; without it Google's anonymous quota applies.
 */
async function main(): Promise<void> {
  loadCustomerEnv();
  const adminOrigin = requireEnv("ADMIN_ORIGIN");
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 4 });
  try {
    const report = await runSiteHealth(db, {
      // Through the outbox like every staff alert, so the alert is kept even without a Brevo key.
      transport: createAppEmailTransport(db),
      alertTo: process.env.SUPPORT_ALERT_EMAIL?.trim() || process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault(),
      adminOrigin,
      pageSpeedKey: process.env.PAGESPEED_API_KEY?.trim() || null,
    });
    console.log(
      `Site health: ${report.sites} sites, ${report.up} up, ${report.down} down, ${report.errors} failed checks, ${report.speedChecks} phone speed checks, ${report.alertsSent} down alerts sent.`,
    );
    // A check that failed on our side, or an alert that did not go, fails the run so the unit's failure alert is seen.
    if (report.errors > 0 || report.alertsFailed > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("Site health run failed", error);
  process.exitCode = 1;
});
