import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completeClientIntake, findClientIntake, saveClientIntakeAnswers } from "./queries/client-intakes";
import { insertBusiness } from "./queries/onboarding";
import { users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const NOW = new Date("2026-10-29T08:00:00.000Z");
const LATER = new Date("2026-10-29T08:05:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Meera Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
  ]);
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
});

/** Postgres reports a missing privilege as 42501 and a failed check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

const asOwner = <T>(run: (tx: Parameters<Parameters<typeof withTenantScope>[2]>[0]) => Promise<T>) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, run);

describe("the questions a customer answers before paying", () => {
  it("has no row until the first answer", async () => {
    expect(await asOwner((tx) => findClientIntake(tx, businessId))).toBeNull();
  });

  it("creates the row on the first answer and keeps the other answers when a later one is saved", async () => {
    await asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { businessType: "clinic", askedForServices: ["managed-website"] }, now: NOW }));
    await asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { websiteState: "new_site", socialChannels: ["instagram"] }, now: LATER }));
    const row = await asOwner((tx) => findClientIntake(tx, businessId));
    expect(row).toMatchObject({ businessType: "clinic", websiteState: "new_site", socialChannels: ["instagram"], askedForServices: ["managed-website"], completedAt: null });
    expect(row?.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it("marks the questions done once, whether or not anything was answered", async () => {
    await asOwner((tx) => completeClientIntake(tx, { businessId, now: NOW }));
    await asOwner((tx) => completeClientIntake(tx, { businessId, now: LATER }));
    const row = await asOwner((tx) => findClientIntake(tx, businessId));
    expect(row?.completedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row?.businessType).toBeNull();
  });
});

describe("whose answers a customer can see and change", () => {
  it("reads and writes only its own row", async () => {
    await dbs.staff.db.transaction((tx) => saveClientIntakeAnswers(tx, { businessId: otherBusinessId, answers: { businessType: "salon" }, now: NOW }));
    expect(await asOwner((tx) => findClientIntake(tx, otherBusinessId))).toBeNull();
    const state = await sqlState(() => asOwner((tx) => saveClientIntakeAnswers(tx, { businessId: otherBusinessId, answers: { businessType: "retail" }, now: LATER })));
    expect(state).toBe("42501");
    const [row] = (await dbs.owner.db.execute(sql`select business_type from client_intakes where business_id = ${otherBusinessId}`)).rows as { business_type: string }[];
    expect(row?.business_type).toBe("salon");
  });

  it("cannot delete its row", async () => {
    await asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { businessType: "clinic" }, now: NOW }));
    const state = await sqlState(() => asOwner((tx) => tx.execute(sql`delete from client_intakes where business_id = ${businessId}`)));
    expect(state).toBe("42501");
  });

  it("lets staff read every row", async () => {
    await asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { businessType: "clinic" }, now: NOW }));
    expect((await dbs.staff.db.transaction((tx) => findClientIntake(tx, businessId)))?.businessType).toBe("clinic");
  });
});

describe("what the database refuses", () => {
  it("a service that is not one of the three", async () => {
    const state = await sqlState(() => asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { askedForServices: ["managed-website", "gold-plating"] }, now: NOW })));
    expect(state).toBe("23514");
  });

  it("an answer that is too long, and too many channels", async () => {
    expect(await sqlState(() => asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { primaryGoal: "x".repeat(61) }, now: NOW })))).toBe("23514");
    expect(await sqlState(() => asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { existingWebsiteUrl: `https://${"a".repeat(300)}.in` }, now: NOW })))).toBe("23514");
    expect(await sqlState(() => asOwner((tx) => saveClientIntakeAnswers(tx, { businessId, answers: { socialChannels: Array.from({ length: 9 }, (_, i) => `c${i}`) }, now: NOW })))).toBe("23514");
  });
});
