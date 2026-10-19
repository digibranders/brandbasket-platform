import { describe, expect, it, vi } from "vitest";
import { tallyStaffAccessSince, type Database, type StaffAccessTally } from "@brandbasket/db";
import type { EmailMessage, EmailTransport } from "@brandbasket/email";
import { securityAlertRecipient, sendStaffAccessReview, staffAccessFindings } from "./security-review";

vi.mock("@brandbasket/db", () => ({ tallyStaffAccessSince: vi.fn() }));

const NOW = new Date("2026-11-01T22:00:00.000Z");
const db = {} as Database;

function row(staffEmail: string, action: string, result: string, count: number): StaffAccessTally {
  return { staffUserId: staffEmail, staffEmail, action, result, count };
}

describe("staffAccessFindings", () => {
  it("lists only what reached its daily limit, the largest first, in plain words", () => {
    const findings = staffAccessFindings([
      row("asha@brandbasket.in", "invoice.export", "ok", 4),
      row("asha@brandbasket.in", "invoice.export", "ok", 3),
      row("ravi@brandbasket.in", "client.view", "ok", 151),
      row("ravi@brandbasket.in", "client.view", "ok", 20),
      row("ravi@brandbasket.in", "staff.sign_in", "failed", 5),
      row("ravi@brandbasket.in", "staff.sign_in", "ok", 50),
      row("ravi@brandbasket.in", "breach.view", "ok", 500),
    ]);
    expect(findings).toEqual([
      { staff: "ravi@brandbasket.in", what: "Opened a client", count: 151 },
      { staff: "ravi@brandbasket.in", what: "Failed to sign in", count: 5 },
      { staff: "asha@brandbasket.in", what: "Exported the invoice register", count: 4 },
    ]);
  });
});

describe("sendStaffAccessReview", () => {
  it("looks at the last 24 hours and emails the team when something reached a limit", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@brandbasket.in", "access.denied", "denied", 7)]);
    const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
    const listed = await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "hello@brandbasket.in", adminOrigin: "https://console.brandbasket.in", now: NOW });
    expect(listed).toBe(1);
    expect(tallyStaffAccessSince).toHaveBeenCalledWith(db, new Date("2026-10-31T22:00:00.000Z"));
    expect(send.mock.calls[0]?.[0].bodyText).toContain("asha@brandbasket.in: Was refused a page that needs a higher role, 7 times");
    expect(send.mock.calls[0]?.[0].bodyText).toContain("https://console.brandbasket.in/access-log");
  });

  it("sends nothing on a quiet day", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@brandbasket.in", "client.view", "ok", 12)]);
    const send = vi.fn(async () => undefined);
    expect(await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "a@b.in", adminOrigin: "https://console.brandbasket.in", now: NOW })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("securityAlertRecipient", () => {
  it("prefers the security mailbox, then the support alerts, then the team address, then hello@brandbasket.in", () => {
    expect(securityAlertRecipient({ SECURITY_ALERT_EMAIL: "sec@brandbasket.in", SUPPORT_ALERT_EMAIL: "s@brandbasket.in" })).toBe("sec@brandbasket.in");
    expect(securityAlertRecipient({ SUPPORT_ALERT_EMAIL: "s@brandbasket.in" })).toBe("s@brandbasket.in");
    expect(securityAlertRecipient({ BRANDBASKET_TEAM_EMAIL: "t@brandbasket.in" })).toBe("t@brandbasket.in");
    expect(securityAlertRecipient({})).toBe("hello@brandbasket.in");
    expect(securityAlertRecipient({})).toBe("hello@brandbasket.in");
  });
});
