import { describe, expect, it, vi } from "vitest";
import { tallyStaffAccessSince, type Database, type StaffAccessTally } from "@fynix/db";
import type { EmailMessage, EmailTransport } from "@fynix/email";
import { securityAlertRecipient, sendStaffAccessReview, staffAccessFindings } from "./security-review";

vi.mock("@fynix/db", () => ({ tallyStaffAccessSince: vi.fn() }));

const NOW = new Date("2026-11-01T22:00:00.000Z");
const db = {} as Database;

function row(staffEmail: string, action: string, result: string, count: number): StaffAccessTally {
  return { staffUserId: staffEmail, staffEmail, action, result, count };
}

describe("staffAccessFindings", () => {
  it("lists only what reached its daily limit, the largest first, in plain words", () => {
    const findings = staffAccessFindings([
      row("asha@fynix.digital", "invoice.export", "ok", 4),
      row("asha@fynix.digital", "invoice.export", "ok", 3),
      row("ravi@fynix.digital", "client.view", "ok", 151),
      row("ravi@fynix.digital", "client.view", "ok", 20),
      row("ravi@fynix.digital", "staff.sign_in", "failed", 5),
      row("ravi@fynix.digital", "staff.sign_in", "ok", 50),
      row("ravi@fynix.digital", "breach.view", "ok", 500),
    ]);
    expect(findings).toEqual([
      { staff: "ravi@fynix.digital", what: "Opened a client", count: 151 },
      { staff: "ravi@fynix.digital", what: "Failed to sign in", count: 5 },
      { staff: "asha@fynix.digital", what: "Exported the invoice register", count: 4 },
    ]);
  });
});

describe("sendStaffAccessReview", () => {
  it("looks at the last 24 hours and emails the team when something reached a limit", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@fynix.digital", "access.denied", "denied", 7)]);
    const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
    const listed = await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "hello@fynix.digital", adminOrigin: "https://console.fynix.digital", now: NOW });
    expect(listed).toBe(1);
    expect(tallyStaffAccessSince).toHaveBeenCalledWith(db, new Date("2026-10-31T22:00:00.000Z"));
    expect(send.mock.calls[0]?.[0].bodyText).toContain("asha@fynix.digital: Was refused a page that needs a higher role, 7 times");
    expect(send.mock.calls[0]?.[0].bodyText).toContain("https://console.fynix.digital/access-log");
  });

  it("sends nothing on a quiet day", async () => {
    vi.mocked(tallyStaffAccessSince).mockResolvedValue([row("asha@fynix.digital", "client.view", "ok", 12)]);
    const send = vi.fn(async () => undefined);
    expect(await sendStaffAccessReview(db, { send } as unknown as EmailTransport, { to: "a@b.in", adminOrigin: "https://console.fynix.digital", now: NOW })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("securityAlertRecipient", () => {
  it("prefers the security mailbox, then the support alerts, then the team address, then hello@fynix.digital", () => {
    expect(securityAlertRecipient({ SECURITY_ALERT_EMAIL: "sec@fynix.digital", SUPPORT_ALERT_EMAIL: "s@fynix.digital" })).toBe("sec@fynix.digital");
    expect(securityAlertRecipient({ SUPPORT_ALERT_EMAIL: "s@fynix.digital" })).toBe("s@fynix.digital");
    expect(securityAlertRecipient({ FYNIX_TEAM_EMAIL: "t@fynix.digital" })).toBe("t@fynix.digital");
    expect(securityAlertRecipient({})).toBe("hello@fynix.digital");
    expect(securityAlertRecipient({})).toBe("hello@fynix.digital");
  });
});
