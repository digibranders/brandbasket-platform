import {
  deliveryHealth,
  findEmail,
  listAlertDeliveries,
  listEmailDeliveries,
  listWebhookEvents,
  updateEmailDelivery,
  type StoredEmail,
} from "@brandbasket/db";
import { BrevoDeliveryError } from "@brandbasket/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { countFailedDeliveries24h, loadDeliveries, resendEmail } from "./deliveries";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    deliveryHealth: vi.fn(),
    findEmail: vi.fn(),
    listAlertDeliveries: vi.fn(),
    listEmailDeliveries: vi.fn(),
    listWebhookEvents: vi.fn(),
    updateEmailDelivery: vi.fn(),
  };
});
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./teams-admin", () => ({ resendFailedAlert: vi.fn() }));

const DB = { name: "staff" } as unknown as ReturnType<typeof getStaffDb>;
const NOW = new Date("2026-11-30T10:00:00.000Z");
const ID = "0198f2c0-0000-7000-8000-0000000000aa";
const QUIET = { total: 0, failed: 0, lastOkAt: null, lastFailedAt: null };
const HEALTH = { razorpay: QUIET, calcom: { ...QUIET, total: 2, failed: 1 }, oyechats: QUIET, brevo: { ...QUIET, total: 5, failed: 2 }, teams: QUIET };
const FAILED: StoredEmail = {
  id: ID,
  toAddress: "kavya@example.in",
  subject: "Reply to your request",
  template: "support-reply",
  bodyText: "Hello",
  bodyHtml: "<p>Hello</p>",
  transport: "brevo",
  status: "failed",
  providerMessageId: null,
  error: "Brevo could not be reached",
  attempts: 1,
  lastAttemptAt: NOW,
  bodyRedacted: false,
  createdAt: NOW,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(deliveryHealth).mockResolvedValue(HEALTH);
  vi.mocked(listWebhookEvents).mockResolvedValue([]);
  vi.mocked(listEmailDeliveries).mockResolvedValue([]);
  vi.mocked(listAlertDeliveries).mockResolvedValue([]);
});

describe("loadDeliveries", () => {
  it("reads health for the last 24 hours and only the sources the filter wants", async () => {
    await loadDeliveries({ failedOnly: true, direction: "out", source: null, search: "kavya" }, NOW);
    expect(deliveryHealth).toHaveBeenCalledWith(DB, new Date("2026-11-29T10:00:00.000Z"));
    expect(listWebhookEvents).not.toHaveBeenCalled();
    expect(listEmailDeliveries).toHaveBeenCalledWith(DB, { failedOnly: true, search: "kavya", limit: 100 });
    expect(listAlertDeliveries).toHaveBeenCalledWith(DB, { failedOnly: true, search: "kavya", limit: 100 });
  });

  it("asks for one webhook source when the filter names one", async () => {
    await loadDeliveries({ failedOnly: false, direction: null, source: "calcom", search: null }, NOW);
    expect(listWebhookEvents).toHaveBeenCalledWith(DB, { failedOnly: false, search: null, limit: 100, source: "calcom" });
    expect(listEmailDeliveries).not.toHaveBeenCalled();
  });
});

describe("resendEmail", () => {
  it("sends the stored message again and records Brevo's id", async () => {
    vi.mocked(findEmail).mockResolvedValue(FAILED);
    const send = vi.fn().mockResolvedValue({ providerMessageId: "<new@brevo>" });
    expect(await resendEmail(ID, NOW, { send })).toBe("sent");
    expect(send).toHaveBeenCalledWith({ to: "kavya@example.in", subject: "Reply to your request", template: "support-reply", bodyText: "Hello", bodyHtml: "<p>Hello</p>" });
    expect(updateEmailDelivery).toHaveBeenCalledWith(DB, ID, { status: "sent", providerMessageId: "<new@brevo>", error: null, now: NOW });
  });

  it("records the reason when it fails again", async () => {
    vi.mocked(findEmail).mockResolvedValue(FAILED);
    expect(await resendEmail(ID, NOW, { send: vi.fn().mockRejectedValue(new BrevoDeliveryError("x", 400, "bad address")) })).toBe("failed");
    expect(updateEmailDelivery).toHaveBeenCalledWith(DB, ID, { status: "failed", providerMessageId: null, error: "Brevo answered 400: bad address", now: NOW });
  });

  it("refuses an email that was sent, is a redacted copy or does not exist, and says when Brevo is not set up", async () => {
    vi.mocked(findEmail).mockResolvedValueOnce({ ...FAILED, status: "sent" });
    expect(await resendEmail(ID, NOW, { send: vi.fn() })).toBe("refused");
    vi.mocked(findEmail).mockResolvedValueOnce({ ...FAILED, bodyRedacted: true });
    expect(await resendEmail(ID, NOW, { send: vi.fn() })).toBe("refused");
    vi.mocked(findEmail).mockResolvedValueOnce(null);
    expect(await resendEmail(ID, NOW, { send: vi.fn() })).toBe("refused");
    vi.mocked(findEmail).mockResolvedValueOnce(FAILED);
    expect(await resendEmail(ID, NOW, null)).toBe("unavailable");
    expect(updateEmailDelivery).not.toHaveBeenCalled();
  });
});

describe("countFailedDeliveries24h", () => {
  it("adds up every source's failures in the last 24 hours", async () => {
    expect(await countFailedDeliveries24h(NOW)).toBe(3);
  });
});
