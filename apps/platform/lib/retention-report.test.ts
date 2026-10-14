import { describe, expect, it } from "vitest";
import { retentionReport } from "./retention-report";

const COUNTS = {
  sessions: 4,
  verifications: 2,
  rateLimitBuckets: 130,
  accountOtps: 0,
  leads: 3,
  enquiries: 5,
  visitors: 1,
  exitFeedback: 0,
  privacyRequests: 0,
  breachRecords: 0,
  staffAccessLog: 12,
  consentRecords: 2,
};
const SCHEDULED = "3 leads, 5 enquiries, 1 visitor accounts, 0 exit feedback, 0 privacy requests, 0 breach records, 12 staff access log rows, 2 consent records";

describe("retentionReport", () => {
  it("says what was removed, one count per kind, on one line", () => {
    expect(retentionReport(COUNTS, false)).toBe(`Retention: removed 4 sessions, 2 verification tokens, 130 rate-limit windows, 0 account codes; on the retention schedule ${SCHEDULED}.`);
  });

  it("says what would be removed on a dry run, and that nothing was", () => {
    expect(retentionReport(COUNTS, true)).toBe(`Retention (dry run, nothing removed): would remove 4 sessions, 2 verification tokens, 130 rate-limit windows, 0 account codes; on the retention schedule ${SCHEDULED}.`);
  });
});
