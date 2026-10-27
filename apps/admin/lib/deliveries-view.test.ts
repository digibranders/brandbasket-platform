import type { DeliveryHealth, StoredAlertDelivery, StoredEmail, StoredWebhookEvent } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  alertRow,
  canResendEmail,
  deliveriesHref,
  deliveryFigures,
  deliveryTotals,
  emailRow,
  mergeDeliveries,
  readDeliveryFilter,
  wantsSource,
  wantsWebhooks,
  webhookRow,
  type DeliveryFilter,
} from "./deliveries-view";

const AT = new Date("2026-11-30T05:12:07.000Z");
const ID = "0198f2c0-0000-7000-8000-0000000000aa";

const WEBHOOK: StoredWebhookEvent = {
  id: ID,
  source: "calcom",
  eventType: "BOOKING_RESCHEDULED",
  result: "bad_signature",
  error: null,
  businessId: null,
  businessName: null,
  bodySha256: "a".repeat(64),
  bodyBytes: 412,
  receivedAt: AT,
};

const EMAIL: StoredEmail = {
  id: ID,
  toAddress: "vikram.rao@omsweets",
  subject: "Your setup link",
  template: "setup-link",
  bodyText: "b",
  bodyHtml: "<p>b</p>",
  transport: "brevo",
  status: "failed",
  providerMessageId: null,
  error: "Brevo answered 400",
  attempts: 1,
  lastAttemptAt: AT,
  bodyRedacted: false,
  createdAt: AT,
};

const ALERT: StoredAlertDelivery = { id: ID, destination: "enquiries", title: "Green Leaf Cafe", result: "sent", card: null, attempts: 1, createdAt: AT, lastAttemptAt: AT };

const NONE: DeliveryFilter = { failedOnly: false, direction: null, source: null, search: null };

const QUIET = { total: 0, failed: 0, lastOkAt: null, lastFailedAt: null };
const HEALTH: DeliveryHealth = {
  razorpay: { total: 38, failed: 0, lastOkAt: AT, lastFailedAt: null },
  calcom: { total: 6, failed: 1, lastOkAt: AT, lastFailedAt: AT },
  oyechats: { ...QUIET, total: 17 },
  brevo: { total: 81, failed: 2, lastOkAt: AT, lastFailedAt: AT },
  teams: { ...QUIET, total: 15 },
};

describe("rows", () => {
  it("turns a webhook into a row with its label, and a failed one into a failed row", () => {
    expect(webhookRow(WEBHOOK)).toMatchObject({ source: "calcom", direction: "in", event: "BOOKING_RESCHEDULED", eventIsCode: true, target: null, outcome: "failed", resultLabel: "Bad signature", resend: null, href: `/deliveries/${ID}` });
    expect(webhookRow({ ...WEBHOOK, result: "handled", businessName: "Sai Dental Care" })).toMatchObject({ outcome: "ok", resultLabel: "Handled", target: "Sai Dental Care" });
    expect(webhookRow({ ...WEBHOOK, result: "ignored" }).outcome).toBe("quiet");
  });

  it("turns an email into a row named for its template, resendable only when it failed and its body is whole", () => {
    expect(emailRow(EMAIL)).toMatchObject({ source: "brevo", direction: "out", event: "Setup link", eventIsCode: false, target: "vikram.rao@omsweets", outcome: "failed", resultLabel: "Not sent", detail: "Brevo answered 400", resend: "email", href: `/outbox/${ID}` });
    expect(emailRow({ ...EMAIL, attempts: 3 }).resultLabel).toBe("Not sent, 3 tries");
    expect(emailRow({ ...EMAIL, bodyRedacted: true }).resend).toBeNull();
    expect(emailRow({ ...EMAIL, status: "local_only", error: null })).toMatchObject({ outcome: "quiet", resultLabel: "Kept, not sent", resend: null });
  });

  it("turns an alert into a row named for its channel, resendable only while its card is kept", () => {
    expect(alertRow(ALERT)).toMatchObject({ source: "teams", event: "Enquiries card", target: "Green Leaf Cafe", outcome: "ok", resultLabel: "Sent", resend: null, href: `/deliveries/${ID}` });
    expect(alertRow({ ...ALERT, result: "unreachable", card: {} })).toMatchObject({ outcome: "failed", resultLabel: "Teams not reached", resend: "alert" });
  });

  it("knows which emails can be sent again", () => {
    expect(canResendEmail(EMAIL)).toBe(true);
    expect(canResendEmail({ ...EMAIL, status: "sent" })).toBe(false);
    expect(canResendEmail({ ...EMAIL, bodyRedacted: true })).toBe(false);
  });
});

describe("mergeDeliveries", () => {
  it("lays the sources together, newest first, and keeps the first rows only", () => {
    const older = webhookRow({ ...WEBHOOK, receivedAt: new Date(AT.getTime() - 1000) });
    const newer = emailRow({ ...EMAIL, createdAt: new Date(AT.getTime() + 1000) });
    expect(mergeDeliveries([[older], [newer], [alertRow(ALERT)]], 2).map((row) => row.source)).toEqual(["brevo", "teams"]);
  });
});

describe("filters", () => {
  it("reads the address's filters, ignoring anything it does not know", () => {
    expect(readDeliveryFilter({ result: "failed", direction: "out", source: "brevo", q: "  om sweets " })).toEqual({ failedOnly: true, direction: "out", source: "brevo", search: "om sweets" });
    expect(readDeliveryFilter({ result: "nope", direction: "sideways", source: "fax", q: "" })).toEqual(NONE);
    expect(readDeliveryFilter({ q: "x".repeat(200) }).search).toHaveLength(100);
  });

  it("builds the address for a changed filter", () => {
    expect(deliveriesHref(NONE, { failedOnly: true })).toBe("/deliveries?result=failed");
    expect(deliveriesHref({ ...NONE, search: "om" }, { source: "teams" })).toBe("/deliveries?source=teams&q=om");
    expect(deliveriesHref({ ...NONE, failedOnly: true }, { failedOnly: false })).toBe("/deliveries");
  });

  it("decides which sources a filter wants", () => {
    expect(wantsWebhooks({ ...NONE, direction: "out" })).toBe(false);
    expect(wantsWebhooks({ ...NONE, source: "razorpay" })).toBe(true);
    expect(wantsWebhooks({ ...NONE, source: "brevo" })).toBe(false);
    expect(wantsSource({ ...NONE, direction: "in" }, "brevo")).toBe(false);
    expect(wantsSource({ ...NONE, source: "teams" }, "teams")).toBe(true);
    expect(wantsSource({ ...NONE, source: "teams" }, "brevo")).toBe(false);
  });
});

describe("figures", () => {
  it("gives one figure per source, saying all handled or how many failed", () => {
    expect(deliveryFigures(HEALTH).map((item) => [item.label, item.value, item.note, item.tone])).toEqual([
      ["Razorpay", 38, "all handled", "good"],
      ["Cal.com", 6, "1 failed", "bad"],
      ["OyeChats", 17, "all handled", "good"],
      ["Brevo email", 81, "2 not sent", "bad"],
      ["Teams alerts", 15, "all sent", "good"],
    ]);
  });

  it("totals what came in, what went out and what failed", () => {
    expect(deliveryTotals(HEALTH)).toEqual({ in: 61, out: 96, failed: 3 });
  });
});
