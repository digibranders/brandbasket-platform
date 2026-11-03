import { createDatabase } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { parseMonthlyReportArgs } from "@brandbasket/shared/lib/reports/job-args";
import { composeMonthlyReports } from "@brandbasket/shared/server/monthly-reports";

/*
 * `pnpm reports:run [--month 2026-10] [--dry-run] [--business <id>]`: writes the month's customer reports as drafts, for every
 * business with a service to report on, from real records only (plan 58). It sends nothing: staff review each draft in the
 * console (Reports) and send it from there. A report staff already approved or sent is left alone. brandbasket-monthly-reports.timer
 * runs it on the 1st of each month (docs/monthly-reports.md). The default month is the last full month in India.
 */
async function main(): Promise<void> {
  loadLocalEnv();
  const args = parseMonthlyReportArgs(process.argv.slice(2).filter((argument) => argument !== "--"), new Date());
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 2 });
  try {
    const summary = await composeMonthlyReports(db, { month: args.month, now: new Date(), dryRun: args.dryRun, ...(args.businessId === undefined ? {} : { businessId: args.businessId }) });
    for (const result of summary.results) {
      console.log(`${result.outcome.padEnd(16)} ${result.businessName} / ${result.service}${result.error === undefined ? "" : `: ${result.error}`}`);
    }
    const count = (outcome: string): number => summary.results.filter((result) => result.outcome === outcome).length;
    console.log(
      `Monthly reports for ${summary.month}${summary.dryRun ? " (dry run, nothing written)" : ""}: ${count("composed")} composed, ${count("nothing-measured")} with nothing measured, ${count("frozen")} already approved or sent, ${count("failed")} failed.`,
    );
    // A report that could not be composed fails the run, so the unit's failure alert is seen.
    if (count("failed") > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("Monthly reports run failed", error);
  process.exitCode = 1;
});
