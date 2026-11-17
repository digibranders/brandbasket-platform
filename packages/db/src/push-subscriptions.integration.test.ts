import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listLivePushSubscriptions, markPushDelivered, PUSH_USER_AGENT_MAX, revokePushSubscription, revokePushSubscriptionById, savePushSubscription } from "./queries/push-subscriptions";
import { pushSubscriptions, users } from "./schema";
import { withUserScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const ASHA = "owner-a";
const EDITOR = "editor-a";
const STAFF = "staff-a";
const ENDPOINT = "https://push.example/a";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: ASHA, name: "Asha", email: "asha@example.com" },
    { id: EDITOR, name: "Eshan", email: "eshan@example.com" },
    { id: STAFF, name: "Team", email: "team@example.com" },
  ]);
});

const input = (userId: string, endpoint = ENDPOINT, audience: "customer" | "staff" = "customer") => ({ audience, userId, endpoint, p256dh: "key", auth: "secret" });

describe("saving and removing a subscription", () => {
  it("saves one row per endpoint, however often the browser subscribes", async () => {
    await savePushSubscription(dbs.staff.db, { ...input(ASHA), userAgent: "x".repeat(PUSH_USER_AGENT_MAX + 50) });
    await savePushSubscription(dbs.staff.db, input(ASHA));
    const rows = await dbs.owner.db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userAgent).toBeNull();
  });

  it("stores a long user agent cut to the limit", async () => {
    await savePushSubscription(dbs.staff.db, { ...input(ASHA), userAgent: "x".repeat(PUSH_USER_AGENT_MAX + 50) });
    const [row] = await dbs.owner.db.select().from(pushSubscriptions);
    expect(row?.userAgent).toHaveLength(PUSH_USER_AGENT_MAX);
  });

  it("clears revoked_at when the same browser subscribes again", async () => {
    await savePushSubscription(dbs.staff.db, input(ASHA));
    expect(await revokePushSubscription(dbs.staff.db, ASHA, ENDPOINT)).toBe(true);
    await savePushSubscription(dbs.staff.db, input(ASHA));
    const [row] = await dbs.owner.db.select().from(pushSubscriptions);
    expect(row?.revokedAt).toBeNull();
  });

  it("moves a shared browser to the person who signed in on it last", async () => {
    await savePushSubscription(dbs.staff.db, input(ASHA));
    await savePushSubscription(dbs.staff.db, input(EDITOR));
    const rows = await dbs.owner.db.select().from(pushSubscriptions);
    expect(rows.map((row) => row.userId)).toEqual([EDITOR]);
  });

  it("lets a customer remove only their own browser, through the customer connection", async () => {
    await savePushSubscription(dbs.staff.db, input(ASHA));
    expect(await withUserScope(dbs.app.db, ASHA, (tx) => revokePushSubscription(tx, EDITOR, ENDPOINT))).toBe(false);
    expect(await withUserScope(dbs.app.db, EDITOR, (tx) => revokePushSubscription(tx, ASHA, ENDPOINT))).toBe(false);
    expect(await withUserScope(dbs.app.db, ASHA, (tx) => revokePushSubscription(tx, ASHA, ENDPOINT))).toBe(true);
    expect(await withUserScope(dbs.app.db, ASHA, (tx) => revokePushSubscription(tx, ASHA, ENDPOINT))).toBe(false);
  });
});

describe("what the sender reads and writes", () => {
  it("lists live subscriptions of one customer, or every staff browser", async () => {
    await savePushSubscription(dbs.staff.db, input(ASHA, "https://push.example/a"));
    await savePushSubscription(dbs.staff.db, input(ASHA, "https://push.example/b"));
    await savePushSubscription(dbs.staff.db, input(EDITOR, "https://push.example/c"));
    await savePushSubscription(dbs.staff.db, input(STAFF, "https://push.example/s1", "staff"));
    await savePushSubscription(dbs.staff.db, input(STAFF, "https://push.example/s2", "staff"));
    await revokePushSubscription(dbs.staff.db, ASHA, "https://push.example/b");
    expect((await listLivePushSubscriptions(dbs.staff.db, "customer", ASHA)).map((row) => row.endpoint)).toEqual(["https://push.example/a"]);
    expect(await listLivePushSubscriptions(dbs.staff.db, "staff", null)).toHaveLength(2);
  });

  it("records a delivery and a gone subscription", async () => {
    await savePushSubscription(dbs.staff.db, input(ASHA));
    const [row] = await listLivePushSubscriptions(dbs.staff.db, "customer", ASHA);
    await markPushDelivered(dbs.staff.db, row?.id ?? "");
    await revokePushSubscriptionById(dbs.staff.db, row?.id ?? "");
    const [after] = await dbs.owner.db.select().from(pushSubscriptions);
    expect(after?.lastSuccessAt).not.toBeNull();
    expect(after?.revokedAt).not.toBeNull();
    expect(await listLivePushSubscriptions(dbs.staff.db, "customer", ASHA)).toEqual([]);
  });
});
