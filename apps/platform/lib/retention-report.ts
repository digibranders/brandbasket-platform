import type { RetentionCounts } from "@brandbasket/db";

/** The one line the nightly run and `pnpm retention:run` print: counts only, never what was in the rows. */
export function retentionReport(counts: RetentionCounts, dryRun: boolean): string {
  const technical = `${counts.sessions} sessions, ${counts.verifications} verification tokens, ${counts.rateLimitBuckets} rate-limit windows, ${counts.accountOtps} account codes`;
  const scheduled = [
    `${counts.leads} leads`,
    `${counts.enquiries} enquiries`,
    `${counts.visitors} visitor accounts`,
    `${counts.exitFeedback} exit feedback`,
    `${counts.privacyRequests} privacy requests`,
    `${counts.breachRecords} breach records`,
    `${counts.staffAccessLog} staff access log rows`,
    `${counts.consentRecords} consent records`,
  ].join(", ");
  const things = `${technical}; on the retention schedule ${scheduled}`;
  return dryRun ? `Retention (dry run, nothing removed): would remove ${things}.` : `Retention: removed ${things}.`;
}
