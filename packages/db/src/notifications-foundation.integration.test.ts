import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readExportedNotifications, readExportedPushDevices } from "./queries/account-export";
import { hasTakenWebhookEvent, recordWebhookEvent } from "./queries/deliveries";
import {
  getChannelChoices,
  listBellNotifications,
  listStaffNotifications,
  markNotificationRead,
  markStaffNotificationRead,
  NOTIFICATION_RETENTION_MS,
  purgeOldNotifications,
  setNotificationPreference,
} from "./queries/notifications";
import { listNotificationRecipients, recordNotification, type NotificationRow } from "./queries/notify";
import {
  businesses,
  businessMembers,
  emailMessages,
  emailSuppressions,
  kickoffPromptState,
  notificationPreferences,
  notifications,
  pushSubscriptions,
  setupCallBookings,
  users,
  webhookEvents,
} from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const EDITOR = "editor-a";
const OWNER_B = "owner-b";
const NOW = new Date("2026-11-17T09:00:00.000Z");
const PERMISSION_DENIED = "permission denied";
const RLS_REFUSED = "row-level security";
const SHA = "a".repeat(64);

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Asha", email: "asha@example.com" },
    { id: EDITOR, name: "Eshan", email: "eshan@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER, role: "owner" },
    { businessId: businessA, userId: EDITOR, role: "editor" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

function as<T>(userId: string, businessId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

function customerRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    audience: "customer",
    businessId: businessA,
    userId: OWNER,
    eventKey: "kickoff.booked",
    title: "Your kickoff call is booked for 11:00",
    body: null,
    link: "/help",
    listed: true,
    dedupeKey: "kickoff.booked:call-1",
    ...overrides,
  };
}

const staffRow = (overrides: Partial<NotificationRow> = {}): NotificationRow =>
  customerRow({ audience: "staff", userId: null, businessId: null, eventKey: "kickoff.ended", title: "Did the kickoff call happen?", link: "/calls", dedupeKey: "kickoff.ended:call-1", ...overrides });

describe("the notice ledger", () => {
  it("writes a notice once: the second write with the same key says it was a repeat", async () => {
    const first = await recordNotification(dbs.staff.db, customerRow());
    const second = await recordNotification(dbs.staff.db, customerRow());
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await dbs.owner.db.select().from(notifications)).toHaveLength(1);
  });

  it("writes a staff notice once too, although a staff row has no recipient", async () => {
    const first = await recordNotification(dbs.staff.db, staffRow());
    const second = await recordNotification(dbs.staff.db, staffRow());
    expect(second).toEqual({ id: first.id, created: false });
    expect(await dbs.owner.db.select().from(notifications)).toHaveLength(1);
  });

  it("keeps one key apart per person and per audience", async () => {
    await recordNotification(dbs.staff.db, customerRow());
    await recordNotification(dbs.staff.db, customerRow({ userId: EDITOR }));
    await recordNotification(dbs.staff.db, staffRow({ dedupeKey: "kickoff.booked:call-1" }));
    expect(await dbs.owner.db.select().from(notifications)).toHaveLength(3);
  });

  it("refuses a customer row with no person or business, and a staff row with a person", async () => {
    expect(await captureErrorText(dbs.staff.db.insert(notifications).values(customerRow({ userId: null })))).toContain("notifications_recipient_check");
    expect(await captureErrorText(dbs.staff.db.insert(notifications).values(customerRow({ businessId: null })))).toContain("notifications_recipient_check");
    expect(await captureErrorText(dbs.staff.db.insert(notifications).values(staffRow({ userId: OWNER })))).toContain("notifications_recipient_check");
  });

  it("refuses a link that leaves the app", async () => {
    expect(await captureErrorText(dbs.staff.db.insert(notifications).values(customerRow({ link: "https://evil.example" })))).toContain("notifications_link_check");
    expect(await captureErrorText(dbs.staff.db.insert(notifications).values(customerRow({ link: "//evil.example" })))).toContain("notifications_link_check");
  });
});

describe("who can read and change a notice", () => {
  beforeEach(async () => {
    await recordNotification(dbs.staff.db, customerRow());
    await recordNotification(dbs.staff.db, customerRow({ userId: EDITOR, dedupeKey: "editor:1", title: "Editor's own" }));
    await recordNotification(dbs.staff.db, customerRow({ listed: false, dedupeKey: "ledger:1", title: "Ledger only" }));
    await recordNotification(dbs.staff.db, customerRow({ businessId: businessB, userId: OWNER_B, dedupeKey: "b:1", title: "Other business" }));
    await recordNotification(dbs.staff.db, staffRow());
  });

  it("shows a person their own listed notices for the business, and nothing else", async () => {
    const own = await as(OWNER, businessA, (tx) => listBellNotifications(tx, OWNER));
    expect(own.map((row) => row.title)).toEqual(["Your kickoff call is booked for 11:00"]);
    expect(await as(OWNER_B, businessA, (tx) => listBellNotifications(tx, OWNER_B))).toEqual([]);
  });

  it("never shows a customer a staff notice or another member's", async () => {
    const rows = await as(OWNER, businessA, (tx) => tx.select().from(notifications));
    expect(rows.map((row) => row.title).sort()).toEqual(["Ledger only", "Your kickoff call is booked for 11:00"]);
    expect(rows.every((row) => row.audience === "customer" && row.userId === OWNER)).toBe(true);
  });

  it("marks a notice read for its owner, once, and never for anyone else", async () => {
    const [own] = await as(OWNER, businessA, (tx) => listBellNotifications(tx, OWNER));
    expect(await as(EDITOR, businessA, (tx) => markNotificationRead(tx, EDITOR, own?.id ?? ""))).toBe(false);
    expect(await as(OWNER, businessA, (tx) => markNotificationRead(tx, OWNER, own?.id ?? "", NOW))).toBe(true);
    expect(await as(OWNER, businessA, (tx) => markNotificationRead(tx, OWNER, own?.id ?? "", new Date("2026-11-18T00:00:00Z")))).toBe(false);
    const [after] = await as(OWNER, businessA, (tx) => listBellNotifications(tx, OWNER));
    expect(after?.readAt).toEqual(NOW);
  });

  it("lets the customer role change nothing but read_at, add nothing and delete nothing", async () => {
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.update(notifications).set({ title: "Changed" })))).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.insert(notifications).values(customerRow({ dedupeKey: "x" }))))).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.delete(notifications)))).toContain(PERMISSION_DENIED);
  });

  it("gives the public role no access at all", async () => {
    expect(await captureErrorText(dbs.publicRole.db.select().from(notifications))).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(dbs.publicRole.db.select().from(pushSubscriptions))).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(dbs.publicRole.db.select().from(kickoffPromptState))).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(dbs.publicRole.db.select().from(emailSuppressions))).toContain(PERMISSION_DENIED);
  });

  it("lists staff notices for the console and marks one read once", async () => {
    const rows = await listStaffNotifications(dbs.staff.db);
    expect(rows.map((row) => row.title)).toEqual(["Did the kickoff call happen?"]);
    expect(await markStaffNotificationRead(dbs.staff.db, rows[0]?.id ?? "", NOW)).toBe(true);
    expect(await markStaffNotificationRead(dbs.staff.db, rows[0]?.id ?? "", NOW)).toBe(false);
    const [customer] = await as(OWNER, businessA, (tx) => listBellNotifications(tx, OWNER));
    expect(await markStaffNotificationRead(dbs.staff.db, customer?.id ?? "", NOW)).toBe(false);
  });

  it("purges notices older than 90 days, read or not, and keeps newer ones", async () => {
    await dbs.owner.db.update(notifications).set({ createdAt: new Date(NOW.getTime() - NOTIFICATION_RETENTION_MS - 1000) }).where(eq(notifications.title, "Other business"));
    await dbs.owner.db.update(notifications).set({ createdAt: new Date(NOW.getTime() - NOTIFICATION_RETENTION_MS + 60_000) }).where(eq(notifications.title, "Editor's own"));
    expect(await purgeOldNotifications(dbs.staff.db, NOW)).toBe(1);
    const left = await dbs.owner.db.select({ title: notifications.title }).from(notifications);
    expect(left.map((row) => row.title)).not.toContain("Other business");
    expect(left).toHaveLength(4);
  });
});

describe("recipients", () => {
  it("is the owner unless people are listed, and only members of the business", async () => {
    expect((await listNotificationRecipients(dbs.staff.db, businessA)).map((row) => row.userId)).toEqual([OWNER]);
    expect((await listNotificationRecipients(dbs.staff.db, businessA, [EDITOR, OWNER_B])).map((row) => row.userId)).toEqual([EDITOR]);
    expect(await listNotificationRecipients(dbs.staff.db, businessA, [])).toEqual([]);
  });

  it("gives no address for an account that signs in with a phone number", async () => {
    await dbs.staff.db.update(users).set({ email: "phone-919876543210@placeholder.invalid" }).where(eq(users.id, OWNER));
    const [recipient] = await listNotificationRecipients(dbs.staff.db, businessA);
    expect(recipient).toMatchObject({ userId: OWNER, email: null });
  });
});

describe("channel preferences", () => {
  it("starts from the topic defaults on the channels a person did not touch", async () => {
    await as(OWNER, businessA, (tx) => setNotificationPreference(tx, OWNER, "product_news", "bell", true));
    expect(await getChannelChoices(dbs.staff.db, OWNER, businessA, "product_news")).toEqual({ bell: true, email: false, push: false });
    await as(OWNER, businessA, (tx) => setNotificationPreference(tx, OWNER, "calls", "push", true));
    await as(OWNER, businessA, (tx) => setNotificationPreference(tx, OWNER, "calls", "email", false));
    expect(await getChannelChoices(dbs.staff.db, OWNER, businessA, "calls")).toEqual({ bell: true, email: false, push: true });
  });

  it("accepts the two new topics and refuses a made up one", async () => {
    await as(OWNER, businessA, (tx) => setNotificationPreference(tx, OWNER, "social", "email", false));
    expect(await captureErrorText(dbs.owner.db.insert(notificationPreferences).values({ userId: OWNER, businessId: businessA, topic: "nope" as never, email: true }))).toContain("notification_preferences_topic_check");
  });
});

describe("push subscriptions", () => {
  const subscription = (userId: string, endpoint: string) => ({ audience: "customer" as const, userId, endpoint, p256dh: "key", auth: "secret" });

  it("lets a person manage their own browsers only, one row per endpoint", async () => {
    await as(OWNER, businessA, (tx) => tx.insert(pushSubscriptions).values(subscription(OWNER, "https://push.example/a")));
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.insert(pushSubscriptions).values(subscription(EDITOR, "https://push.example/b"))))).toContain(RLS_REFUSED);
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.insert(pushSubscriptions).values(subscription(OWNER, "https://push.example/a"))))).toContain("push_subscriptions_endpoint_idx");
    await dbs.staff.db.insert(pushSubscriptions).values(subscription(EDITOR, "https://push.example/c"));
    const seen = await as(OWNER, businessA, (tx) => tx.select().from(pushSubscriptions));
    expect(seen.map((row) => row.endpoint)).toEqual(["https://push.example/a"]);
  });

  it("refuses an endpoint that is not https, and a customer subscription written as staff", async () => {
    expect(await captureErrorText(dbs.staff.db.insert(pushSubscriptions).values(subscription(OWNER, "http://push.example/a")))).toContain("push_subscriptions_endpoint_check");
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.insert(pushSubscriptions).values({ ...subscription(OWNER, "https://push.example/z"), audience: "staff" })))).toContain(RLS_REFUSED);
  });
});

describe("kickoff prompt state", () => {
  it("is gone with its booking, as when Cal.com cancels the call", async () => {
    const [booking] = await dbs.staff.db.insert(setupCallBookings).values({ businessId: businessA, startsAt: NOW, endsAt: new Date(NOW.getTime() + 1800_000) }).returning({ id: setupCallBookings.id });
    await dbs.staff.db.insert(kickoffPromptState).values({ callId: booking?.id ?? "", firstNotifiedAt: NOW });
    await dbs.staff.db.delete(setupCallBookings).where(eq(setupCallBookings.id, booking?.id ?? ""));
    expect(await dbs.owner.db.select().from(kickoffPromptState)).toEqual([]);
  });

  it("is closed to the customer role", async () => {
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.select().from(kickoffPromptState)))).toContain(PERMISSION_DENIED);
  });
});

describe("email queue columns and suppressions", () => {
  const email = { toAddress: "a@example.com", subject: "s", template: "t", bodyText: "b", bodyHtml: "<p>b</p>", transport: "brevo" };

  it("accepts a pending message that has not been attempted, and refuses a pending one with no next attempt", async () => {
    await dbs.staff.db.insert(emailMessages).values({ ...email, status: "pending", attempts: 0, nextAttemptAt: NOW });
    expect(await captureErrorText(dbs.staff.db.insert(emailMessages).values({ ...email, status: "pending", attempts: 0 }))).toContain("email_messages_pending_check");
    await dbs.staff.db.insert(emailMessages).values({ ...email, status: "bounced" });
    expect(await captureErrorText(dbs.staff.db.insert(emailMessages).values({ ...email, status: "lost" as never }))).toContain("email_messages_status_check");
  });

  it("keeps suppressed addresses lower case, for staff only", async () => {
    await dbs.staff.db.insert(emailSuppressions).values({ address: "gone@example.com", reason: "bounce" });
    expect(await captureErrorText(dbs.staff.db.insert(emailSuppressions).values({ address: "Gone@Example.com", reason: "bounce" }))).toContain("email_suppressions_address_check");
    expect(await captureErrorText(as(OWNER, businessA, (tx) => tx.select().from(emailSuppressions)))).toContain(PERMISSION_DENIED);
  });
});

describe("webhook event ids", () => {
  const event = { source: "razorpay" as const, eventType: "payment.failed", error: null, businessId: null, bodySha256: SHA, bodyBytes: 10 };

  it("refuses a second handled delivery of the same event id, and tells the caller it was taken", async () => {
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "handled", eventId: "evt_1" });
    expect(await hasTakenWebhookEvent(dbs.staff.db, "razorpay", "evt_1")).toBe(true);
    expect(await hasTakenWebhookEvent(dbs.staff.db, "razorpay", "evt_2")).toBe(false);
    expect(await hasTakenWebhookEvent(dbs.staff.db, "calcom", "evt_1")).toBe(false);
    expect(await captureErrorText(recordWebhookEvent(dbs.staff.db, { ...event, result: "handled", eventId: "evt_1" }))).toContain("webhook_events_event_id_idx");
  });

  it("lets a failed delivery be recorded again and then handled", async () => {
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "failed", eventId: "evt_3" });
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "failed", eventId: "evt_3" });
    expect(await hasTakenWebhookEvent(dbs.staff.db, "razorpay", "evt_3")).toBe(false);
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "handled", eventId: "evt_3" });
    expect(await hasTakenWebhookEvent(dbs.staff.db, "razorpay", "evt_3")).toBe(true);
    expect(await dbs.owner.db.select().from(webhookEvents)).toHaveLength(3);
  });

  it("does not need an id", async () => {
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "handled" });
    await recordWebhookEvent(dbs.staff.db, { ...event, result: "handled" });
    expect(await dbs.owner.db.select().from(webhookEvents)).toHaveLength(2);
  });
});

describe("export", () => {
  it("exports a person's own notices and push devices without the address or keys", async () => {
    await recordNotification(dbs.staff.db, customerRow());
    await recordNotification(dbs.staff.db, customerRow({ userId: EDITOR, dedupeKey: "e" }));
    await dbs.staff.db.insert(pushSubscriptions).values({ audience: "customer", userId: OWNER, endpoint: "https://push.example/a", p256dh: "k", auth: "s", userAgent: "Safari" });
    expect((await readExportedNotifications(dbs.staff.db, OWNER)).map((row) => row.eventKey)).toEqual(["kickoff.booked"]);
    const devices = await readExportedPushDevices(dbs.staff.db, OWNER);
    expect(devices).toEqual([{ userAgent: "Safari", createdAt: expect.any(Date), revokedAt: null }]);
    expect(JSON.stringify(devices)).not.toContain("push.example");
  });
});
