import { describe, expect, it, vi } from "vitest";
import { tallyStaffAccessSince, type Database, type StaffAccessTally } from "@firstfold/db";
import type { EmailMessage, EmailTransport } from "@firstfold/email";
import { securityAlertRecipient, sendStaffAccessReview, staffAccessFindings } from "./security-review";

vi.mock("@firstfold/db", () => ({ tallyStaffAccessSince: vi.fn() }));

const NOW = new Date("2026-11-01T22:00:00.000Z");
const db = {} as Database;

function row(staffEmail: string, action: string, result: string, count: number): StaffAccessTally {
  return { staffUserId: staffEmail, staffEmail, action, result, count };
}

describe("staffAccessFindings", () => {
  it("lists only what reached its daily limit, the largest first, in plain words", () => {
    const findings = staffAccessFindings([
      row("asha@firstfold.io", "invoice.export", "ok", 4),
      row("asha@firstfold.io", "invoice.export", "ok", 3),
      row("ravi@firstfold.io", "client.view", "ok", 151),
      row("ravi@firstfold.io", "client.view", "ok", 20),
      row("ravi@firstfold.io", "staff.sign_in", "failed", 5),
      row("ravi@firstfold.io", "staff.sign_in", "ok", 50),
      row("ravi@firstfold.io", "breach.view", "ok", 500),
    ]);
    expect(findings).toEqual([
      { staff: "ravi@firstfold.io", what: "Opened a client", count: 151 },
      { staff: "ravi@firstfold.io", what: "Failed to sign in", count: 5 },
      { staff: "asha@firstfold.io", what: "Exported the invoice register", count: 4 },
    ]);
  });
});

describe("sendStaffAccessReview", () => {
  it("looks at the last 24 hours and emails the team when something reached a limit", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@firstfold.io", "access.denied", "denied", 7)]);
    const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
    const listed = await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "support@firstfold.io", adminOrigin: "https://admin.firstfold.io", now: NOW });
    expect(listed).toBe(1);
    expect(tallyStaffAccessSince).toHaveBeenCalledWith(db, new Date("2026-10-31T22:00:00.000Z"));
    expect(send.mock.calls[0]?.[0].bodyText).toContain("asha@firstfold.io: Was refused a page that needs a higher role, 7 times");
    expect(send.mock.calls[0]?.[0].bodyText).toContain("https://admin.firstfold.io/access-log");
  });

  it("sends nothing on a quiet day", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@firstfold.io", "client.view", "ok", 12)]);
    const send = vi.fn(async () => undefined);
    expect(await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "a@b.in", adminOrigin: "https://admin.firstfold.io", now: NOW })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("securityAlertRecipient", () => {
  it("prefers the security mailbox, then the support alerts, then the team address, then support@firstfold.io", () => {
    expect(securityAlertRecipient({ SECURITY_ALERT_EMAIL: "sec@firstfold.io", SUPPORT_ALERT_EMAIL: "s@firstfold.io" })).toBe("sec@firstfold.io");
    expect(securityAlertRecipient({ SUPPORT_ALERT_EMAIL: "s@firstfold.io" })).toBe("s@firstfold.io");
    expect(securityAlertRecipient({ FIRSTFOLD_TEAM_EMAIL: "t@firstfold.io" })).toBe("t@firstfold.io");
    expect(securityAlertRecipient({})).toBe("support@firstfold.io");
    expect(securityAlertRecipient({ PLATFORM_BRAND: "fynix" })).toBe("hello@fynix.digital");
  });
});
