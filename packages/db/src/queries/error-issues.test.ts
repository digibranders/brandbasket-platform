import { describe, expect, it } from "vitest";
import { approximateAffectedUsers, errorIssueFingerprint, affectedUserBits } from "./error-issues";

const report = { app: "platform", operation: "server_action", errorClass: "TypeError", route: "/appointments/[id]", frames: [{ file: "page.tsx", line: 12, column: 4 }] };

describe("automatic issue aggregation", () => {
  it("groups independently of release/browser/identity but distinguishes source locations", () => {
    expect(errorIssueFingerprint(report)).toBe(errorIssueFingerprint({ ...report }));
    expect(errorIssueFingerprint({ ...report, frames: [{ file: "page.tsx", line: 13, column: 4 }] })).not.toBe(errorIssueFingerprint(report));
    expect(errorIssueFingerprint({ ...report, route: "/patients/[id]" })).not.toBe(errorIssueFingerprint(report));
  });
  it("keeps bounded irreversible cardinality data rather than user associations", () => {
    const fingerprint = errorIssueFingerprint(report);
    const bits = affectedUserBits(fingerprint, "private-user-id");
    expect(bits).toHaveLength(1024);
    expect(bits).toMatch(/^[01]+$/);
    expect(approximateAffectedUsers(bits)).toEqual({ count: 1, saturated: false });
    expect(approximateAffectedUsers(affectedUserBits(fingerprint))).toEqual({ count: 0, saturated: false });
    expect(approximateAffectedUsers("1".repeat(1024))).toEqual({ count: 1024, saturated: true });
  });
});
