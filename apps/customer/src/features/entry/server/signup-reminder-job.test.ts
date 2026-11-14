import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Lead } from "@brandbasket/db";
import { findBillingState, listAbandonedSignupLeads, markLeadPaidForBusiness, recordSignupReminderSent } from "@brandbasket/db";
import type { EmailMessage, EmailTransport } from "@brandbasket/email";
import { processSignupReminders, signupReminderToken } from "./signup-reminder-job";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getStaffDb: vi.fn(() => ({}) as Database) }));
vi.mock("@brandbasket/db", () => ({
  findBillingState: vi.fn(),
  listAbandonedSignupLeads: vi.fn(),
  markLeadPaidForBusiness: vi.fn(),
  recordSignupReminderSent: vi.fn(),
}));

const NOW = new Date("2026-11-14T12:00:00.000Z");
const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
const mockTransport: EmailTransport = { send };

function makeMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-123",
    name: "Alex Smith",
    businessName: "Smith Bakery",
    email: "alex@smithbakery.test",
    phone: null,
    businessType: null,
    currency: "USD",
    message: null,
    status: "account_created",
    notes: null,
    businessId: "biz-123",
    attachedByStaffId: null,
    attachedAt: null,
    source: "signup",
    plans: ["managed"],
    city: null,
    page: null,
    assignedStaffId: null,
    signupReminderSentAt: null,
    createdAt: new Date("2026-11-13T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processSignupReminders", () => {
  it("sends a reminder to an unpaid abandoned sign-up and records the sent timestamp", async () => {
    const lead = makeMockLead();
    vi.mocked(listAbandonedSignupLeads).mockResolvedValueOnce([lead]);
    vi.mocked(findBillingState).mockResolvedValueOnce({
      hasEverPaid: false,
    } as unknown as Awaited<ReturnType<typeof findBillingState>>);

    const report = await processSignupReminders(NOW, {
      emailTransport: mockTransport,
    });

    expect(report).toEqual({
      checked: 1,
      sent: 1,
      skippedPaid: 0,
      failed: 0,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const sentEmail = send.mock.calls[0]![0];
    expect(sentEmail.to).toBe("alex@smithbakery.test");
    expect(sentEmail.subject).toContain("Finish setting up Smith Bakery");
    expect(sentEmail.bodyText).toContain("/checkout");
    // Ensure no em or en dashes in the sent message
    expect(sentEmail.subject).not.toMatch(/[\u2014\u2013]/);
    expect(sentEmail.bodyText).not.toMatch(/[\u2014\u2013]/);

    expect(recordSignupReminderSent).toHaveBeenCalledWith(expect.anything(), "lead-123", NOW);
  });

  it("does not send a reminder if the business has already paid", async () => {
    const lead = makeMockLead({ businessId: "biz-paid" });
    vi.mocked(listAbandonedSignupLeads).mockResolvedValueOnce([lead]);
    vi.mocked(findBillingState).mockResolvedValueOnce({
      hasEverPaid: true,
    } as unknown as Awaited<ReturnType<typeof findBillingState>>);

    const report = await processSignupReminders(NOW, {
      emailTransport: mockTransport,
    });

    expect(report).toEqual({
      checked: 1,
      sent: 0,
      skippedPaid: 1,
      failed: 0,
    });

    expect(send).not.toHaveBeenCalled();
    expect(markLeadPaidForBusiness).toHaveBeenCalledWith(expect.anything(), "biz-paid");
    expect(recordSignupReminderSent).toHaveBeenCalledWith(expect.anything(), "lead-123", NOW);
  });

  it("records failure when email transport throws and continues without crashing", async () => {
    const lead = makeMockLead();
    vi.mocked(listAbandonedSignupLeads).mockResolvedValueOnce([lead]);
    vi.mocked(findBillingState).mockResolvedValueOnce({
      hasEverPaid: false,
    } as unknown as Awaited<ReturnType<typeof findBillingState>>);
    send.mockRejectedValueOnce(new Error("Brevo down"));

    const report = await processSignupReminders(NOW, {
      emailTransport: mockTransport,
    });

    expect(report).toEqual({
      checked: 1,
      sent: 0,
      skippedPaid: 0,
      failed: 1,
    });

    // Does not record reminder sent when sending failed so it can be retried
    expect(recordSignupReminderSent).not.toHaveBeenCalled();
  });
});

describe("signupReminderToken", () => {
  const originalEnv = process.env.SIGNUP_REMINDER_TOKEN;

  afterEach(() => {
    process.env.SIGNUP_REMINDER_TOKEN = originalEnv;
  });

  it("returns null when token is missing or too short", () => {
    delete process.env.SIGNUP_REMINDER_TOKEN;
    expect(signupReminderToken()).toBeNull();

    process.env.SIGNUP_REMINDER_TOKEN = "short";
    expect(signupReminderToken()).toBeNull();
  });

  it("returns token when sufficiently long", () => {
    process.env.SIGNUP_REMINDER_TOKEN = "0123456789abcdef0123456789abcdef";
    expect(signupReminderToken()).toBe("0123456789abcdef0123456789abcdef");
  });
});
