import { businessMembers, businesses, notificationPreferences, notifications, users } from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { createOutboxTransport } from "@brandbasket/email";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbNotifyStore, createNotifier } from "./server/notify";
import { createFakePushSender, type FakePushSender } from "./server/push-sender";

/** notify() against a real database, the outbox transport and the fake push sender: what lands where, and that a repeat sends nothing. */

let dbs: TestDatabases;
let businessId = "";
let push: FakePushSender;
const errors: unknown[] = [];

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  errors.length = 0;
  push = createFakePushSender();
  await dbs.owner.db.insert(users).values([
    { id: "owner", name: "Asha", email: "asha@example.com", emailVerified: true },
    { id: "editor", name: "Eshan", email: "eshan@example.com", emailVerified: true },
  ]);
  const [business] = await dbs.owner.db.insert(businesses).values({ slug: "rao-dental", name: "Rao Dental Care", currency: "INR" }).returning({ id: businesses.id });
  businessId = business?.id ?? "";
  await dbs.owner.db.insert(businessMembers).values([
    { businessId, userId: "owner", role: "owner" },
    { businessId, userId: "editor", role: "editor" },
  ]);
});

function notifier() {
  const outbox = createOutboxTransport(dbs.staff.db);
  return createNotifier({
    store: createDbNotifyStore(dbs.staff.db),
    sendEmail: (message) => outbox.send(message),
    push,
    origins: { customer: "https://app.brandbasket.in", staff: "https://console.brandbasket.in" },
    staffEmail: "team@brandbasket.in",
    onError: (error) => errors.push(error),
  });
}

const emails = () => querySql<{ to_address: string; subject: string; template: string; status: string }>(dbs.owner, "select to_address, subject, template, status from email_messages order by created_at");

describe("notify against the database", () => {
  it("writes the bell row and queues the email in the outbox for the owner, once", async () => {
    const notify = notifier();
    const input = { event: "kickoff.booked", audience: { kind: "customer", businessId }, dedupeKey: "booking-1", data: { when: "Tue 11:00" } } as const;
    await notify(input);
    await notify(input);
    expect(await emails()).toEqual([{ to_address: "asha@example.com", subject: "Your kickoff call is booked for Tue 11:00", template: "kickoff-booked", status: "local_only" }]);
    const rows = await dbs.owner.db.select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ audience: "customer", userId: "owner", businessId, eventKey: "kickoff.booked", title: "Your kickoff call is booked for Tue 11:00", link: "/help", listed: true, dedupeKey: "kickoff.booked:booking-1" });
    expect(errors).toEqual([]);
  });

  it("follows each person's own choices for an optional event", async () => {
    await dbs.owner.db.insert(notificationPreferences).values([
      { userId: "owner", businessId, topic: "calls", email: false, bell: true, push: true },
      { userId: "editor", businessId, topic: "calls", email: true, bell: false, push: false },
    ]);
    await notifier()({ event: "kickoff.soon", audience: { kind: "customer", businessId, userIds: ["owner", "editor"] }, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(await emails()).toEqual([expect.objectContaining({ to_address: "eshan@example.com" })]);
    expect(push.sent.map((entry) => entry.target.userId)).toEqual(["owner"]);
    const rows = await dbs.owner.db.select({ userId: notifications.userId, listed: notifications.listed }).from(notifications);
    expect(rows.sort((a, b) => String(a.userId).localeCompare(String(b.userId)))).toEqual([
      { userId: "editor", listed: false },
      { userId: "owner", listed: true },
    ]);
  });

  it("sends a mandatory event to the owner whatever the topic is set to", async () => {
    await dbs.owner.db.insert(notificationPreferences).values({ userId: "owner", businessId, topic: "billing", email: false, bell: false, push: false });
    await notifier()({ event: "billing.payment_failed", audience: { kind: "customer", businessId }, dedupeKey: "p1", data: {} });
    // No wording exists for it yet (package N5), so only the ledger row is written: nothing is switched off by the preference.
    const [row] = await dbs.owner.db.select().from(notifications);
    expect(row).toMatchObject({ eventKey: "billing.payment_failed", listed: false });
  });

  it("writes one staff row for the console and emails the team", async () => {
    const notify = notifier();
    const input = { event: "kickoff.ended", audience: { kind: "staff" }, dedupeKey: "call-1", data: { businessName: "Rao Dental Care" } } as const;
    await notify(input);
    await notify(input);
    expect(await emails()).toEqual([expect.objectContaining({ to_address: "team@brandbasket.in", subject: "Did the kickoff call with Rao Dental Care happen?" })]);
    const rows = await dbs.owner.db.select().from(notifications);
    expect(rows).toEqual([expect.objectContaining({ audience: "staff", userId: null, businessId: null, link: "/", listed: true })]);
    expect(push.sent).toHaveLength(1);
  });

  it("does not throw and records the failure when the database refuses the write", async () => {
    await execSql(dbs.owner, "alter table notifications rename to notifications_hidden");
    try {
      const result = await notifier()({ event: "kickoff.booked", audience: { kind: "customer", businessId }, dedupeKey: "booking-2", data: { when: "11:00" } });
      expect(result.failed).toBe(true);
      expect(errors).toHaveLength(1);
      expect(await emails()).toEqual([]);
    } finally {
      await execSql(dbs.owner, "alter table notifications_hidden rename to notifications");
    }
  });
});
