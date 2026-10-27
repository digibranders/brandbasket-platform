import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deliveryHealth,
  findAlertDelivery,
  findWebhookEvent,
  listAlertDeliveries,
  listWebhookEvents,
  purgeOldDeliveries,
  recordAlertDelivery,
  recordWebhookEvent,
  updateAlertDelivery,
} from "./queries/deliveries";
import { alertDeliveries, businesses, webhookEvents } from "./schema";
import { describeError, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-11-30T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SHA = "a".repeat(64);
const CARD = { type: "message", attachments: [] };
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

async function business(name: string): Promise<string> {
  const [row] = await dbs.owner.db.insert(businesses).values({ name, slug: name.toLowerCase().replaceAll(" ", "-") }).returning({ id: businesses.id });
  if (row === undefined) throw new Error("no business");
  return row.id;
}

const webhook = {
  source: "razorpay",
  eventType: "subscription.charged",
  result: "handled",
  error: null,
  businessId: null,
  bodySha256: SHA,
  bodyBytes: 812,
} as const;

describe("webhook events", () => {
  it("are written and read by the staff connection, newest first, with the client's name", async () => {
    const id = await business("Sai Dental Care");
    await recordWebhookEvent(dbs.staff.db, { ...webhook, source: "oyechats", eventType: "lead_captured", businessId: id });
    await recordWebhookEvent(dbs.staff.db, webhook);
    const rows = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: null, limit: 10 });
    expect(rows.map((row) => row.eventType)).toEqual(["subscription.charged", "lead_captured"]);
    expect(rows[1]).toMatchObject({ source: "oyechats", businessId: id, businessName: "Sai Dental Care", bodyBytes: 812 });
  });

  it("filter by failed (failed and bad signature), by source, and by search on event, client or id", async () => {
    await recordWebhookEvent(dbs.staff.db, webhook);
    await recordWebhookEvent(dbs.staff.db, { ...webhook, source: "calcom", eventType: "BOOKING_RESCHEDULED", result: "bad_signature" });
    await recordWebhookEvent(dbs.staff.db, { ...webhook, eventType: "order.paid", result: "failed", error: "Handler threw Error" });
    const failed = await listWebhookEvents(dbs.staff.db, { failedOnly: true, source: null, search: null, limit: 10 });
    expect(failed.map((row) => row.result).sort()).toEqual(["bad_signature", "failed"]);
    const calcom = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: "calcom", search: null, limit: 10 });
    expect(calcom).toHaveLength(1);
    const searched = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: "order", limit: 10 });
    expect(searched.map((row) => row.eventType)).toEqual(["order.paid"]);
    const byId = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: searched[0]?.id ?? "", limit: 10 });
    expect(byId).toHaveLength(1);
    const literal = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: "%", limit: 10 });
    expect(literal).toHaveLength(0);
  });

  it("finds one by id, and answers null for an unknown or malformed id", async () => {
    await recordWebhookEvent(dbs.staff.db, webhook);
    const [row] = await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: null, limit: 1 });
    expect(await findWebhookEvent(dbs.staff.db, row?.id ?? "")).toMatchObject({ eventType: "subscription.charged" });
    expect(await findWebhookEvent(dbs.staff.db, "0198f2c0-0000-7000-8000-00000000dead")).toBeNull();
    expect(await findWebhookEvent(dbs.staff.db, "not-an-id")).toBeNull();
  });

  it("refuse a result or source outside the lists, and a hash that is not SHA-256 hex", async () => {
    await expect(recordWebhookEvent(dbs.staff.db, { ...webhook, bodySha256: "xyz" })).rejects.toSatisfy((error: unknown) => describeError(error).includes("webhook_events_body_sha256_check"));
  });
});

describe("alert deliveries", () => {
  it("keep the card only while the alert has not gone through", async () => {
    await recordAlertDelivery(dbs.staff.db, { destination: "enquiries", title: "New enquiry", result: "unreachable", card: CARD });
    const [failed] = await listAlertDeliveries(dbs.staff.db, { failedOnly: true, search: null, limit: 10 });
    expect(failed).toMatchObject({ destination: "enquiries", result: "unreachable", card: CARD, attempts: 1 });
    await updateAlertDelivery(dbs.staff.db, failed?.id ?? "", { result: "sent", now: NOW });
    expect(await findAlertDelivery(dbs.staff.db, failed?.id ?? "")).toMatchObject({ result: "sent", card: null, attempts: 2, lastAttemptAt: NOW });
  });

  it("never store a card on a sent alert", async () => {
    await expect(recordAlertDelivery(dbs.staff.db, { destination: "system", title: "Error", result: "sent", card: CARD })).rejects.toSatisfy((error: unknown) => describeError(error).includes("alert_deliveries_card_check"));
  });

  it("filter by failed and by title", async () => {
    await recordAlertDelivery(dbs.staff.db, { destination: "support", title: "Request reply", result: "sent", card: null });
    await recordAlertDelivery(dbs.staff.db, { destination: "enquiries", title: "New enquiry", result: "rejected", card: CARD });
    expect(await listAlertDeliveries(dbs.staff.db, { failedOnly: true, search: null, limit: 10 })).toHaveLength(1);
    expect((await listAlertDeliveries(dbs.staff.db, { failedOnly: false, search: "reply", limit: 10 })).map((row) => row.title)).toEqual(["Request reply"]);
  });
});

describe("deliveryHealth", () => {
  it("counts each source in the window, with its last success and last failure", async () => {
    await dbs.owner.db.insert(webhookEvents).values([
      { ...webhook, receivedAt: new Date(NOW.getTime() - HOUR) },
      { ...webhook, result: "failed", receivedAt: new Date(NOW.getTime() - 2 * HOUR) },
      { ...webhook, receivedAt: new Date(NOW.getTime() - 2 * DAY) },
    ]);
    await dbs.owner.db.insert(alertDeliveries).values({ destination: "system", title: "Error", result: "sent", createdAt: new Date(NOW.getTime() - HOUR) });
    const health = await deliveryHealth(dbs.staff.db, new Date(NOW.getTime() - DAY));
    expect(health.razorpay).toEqual({ total: 2, failed: 1, lastOkAt: new Date(NOW.getTime() - HOUR), lastFailedAt: new Date(NOW.getTime() - 2 * HOUR) });
    expect(health.calcom).toEqual({ total: 0, failed: 0, lastOkAt: null, lastFailedAt: null });
    expect(health.teams).toMatchObject({ total: 1, failed: 0 });
    expect(health.brevo).toEqual({ total: 0, failed: 0, lastOkAt: null, lastFailedAt: null });
  });
});

describe("purgeOldDeliveries", () => {
  it("deletes webhook events and alerts older than 90 days and keeps the rest", async () => {
    await dbs.owner.db.insert(webhookEvents).values([
      { ...webhook, receivedAt: new Date(NOW.getTime() - 91 * DAY) },
      { ...webhook, receivedAt: new Date(NOW.getTime() - 89 * DAY) },
    ]);
    await dbs.owner.db.insert(alertDeliveries).values({ destination: "system", title: "Old", result: "sent", createdAt: new Date(NOW.getTime() - 91 * DAY) });
    expect(await purgeOldDeliveries(dbs.staff.db, NOW)).toBe(2);
    expect(await listWebhookEvents(dbs.staff.db, { failedOnly: false, source: null, search: null, limit: 10 })).toHaveLength(1);
  });
});
