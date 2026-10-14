import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addClosure,
  clearAnnouncement,
  deleteClosure,
  findAnnouncement,
  listClosures,
  readSiteFacts,
  replaceOpeningHours,
  saveAnnouncement,
} from "./queries/business-facts";
import { setBusinessTimeZone } from "./queries/business-modules";
import { businesses, businessMembers, businessProfiles, users } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const NOW = new Date("2026-09-25T10:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

function asA<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, work);
}

function asB<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, work);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: OWNER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-clinic", name: "Riverside Clinic" },
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-clinic");
  businessB = idForSlug(inserted, "harbour-salon");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  // Deliberately no business_profiles row: replaceOpeningHours's lock must not depend on one existing (see its
  // "no business_profiles row" test below), and most tests here should exercise the common case of an
  // already-live business with no onboarding row left.
});

describe("closures", () => {
  it("lets a tenant add, list and delete their own closures", async () => {
    const closure = await asA((tx) => addClosure(tx, { startsOn: "2026-12-24", endsOn: "2026-12-26", note: "Holidays" }));
    expect(closure).toMatchObject({ startsOn: "2026-12-24", endsOn: "2026-12-26", note: "Holidays" });

    const listed = await asA((tx) => listClosures(tx));
    expect(listed).toEqual([closure]);

    expect(await asA((tx) => deleteClosure(tx, closure.id))).toBe(true);
    expect(await asA((tx) => listClosures(tx))).toEqual([]);
  });

  it("keeps the hours of a half day as HH:MM, and refuses one time without the other", async () => {
    const half = await asA((tx) =>
      addClosure(tx, { startsOn: "2026-11-10", endsOn: "2026-11-10", note: "Puja", opensAt: "10:00", closesAt: "14:00" }),
    );
    expect(half).toMatchObject({ opensAt: "10:00", closesAt: "14:00" });
    expect(await asA((tx) => listClosures(tx))).toEqual([half]);

    await expect(
      asA((tx) => addClosure(tx, { startsOn: "2026-11-11", endsOn: "2026-11-11", note: null, opensAt: "10:00", closesAt: null })),
    ).rejects.toThrow();
    await expect(
      asA((tx) => addClosure(tx, { startsOn: "2026-11-11", endsOn: "2026-11-11", note: null, opensAt: "10:00", closesAt: "10:00" })),
    ).rejects.toThrow();
  });

  it("orders closures by starts_on, then id", async () => {
    await asA((tx) => addClosure(tx, { startsOn: "2026-12-24", endsOn: "2026-12-26", note: null }));
    await asA((tx) => addClosure(tx, { startsOn: "2026-11-01", endsOn: "2026-11-02", note: null }));
    const listed = await asA((tx) => listClosures(tx));
    expect(listed.map((row) => row.startsOn)).toEqual(["2026-11-01", "2026-12-24"]);
  });

  it("cannot see or delete another business's closures", async () => {
    const closure = await asB((tx) => addClosure(tx, { startsOn: "2026-12-24", endsOn: "2026-12-26", note: null }));

    expect(await asA((tx) => listClosures(tx))).toEqual([]);
    expect(await asA((tx) => deleteClosure(tx, closure.id))).toBe(false);
    expect(await asB((tx) => listClosures(tx))).toEqual([closure]);
  });

  it("returns false deleting a non-UUID or unknown id", async () => {
    expect(await asA((tx) => deleteClosure(tx, "not-a-uuid"))).toBe(false);
    expect(await asA((tx) => deleteClosure(tx, "00000000-0000-0000-0000-000000000000"))).toBe(false);
  });

  it("rejects a closure whose ends_on is before starts_on", async () => {
    const message = await captureErrorText(asA((tx) => addClosure(tx, { startsOn: "2026-12-26", endsOn: "2026-12-24", note: null })));
    expect(message).toMatch(/business_closures_dates_check/);
  });
});

describe("announcement", () => {
  it("is null until saved, then upserts on save", async () => {
    expect(await asA((tx) => findAnnouncement(tx))).toBeNull();
    await asA((tx) => saveAnnouncement(tx, { message: "Closed for Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW));
    expect(await asA((tx) => findAnnouncement(tx))).toEqual({
      message: "Closed for Diwali",
      startsOn: "2026-11-01",
      endsOn: "2026-11-05",
    });

    await asA((tx) => saveAnnouncement(tx, { message: "Back Monday", startsOn: "2026-11-06", endsOn: "2026-11-10" }, NOW));
    expect(await asA((tx) => findAnnouncement(tx))).toEqual({
      message: "Back Monday",
      startsOn: "2026-11-06",
      endsOn: "2026-11-10",
    });
  });

  it("can be cleared", async () => {
    await asA((tx) => saveAnnouncement(tx, { message: "Closed for Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW));
    await asA((tx) => clearAnnouncement(tx));
    expect(await asA((tx) => findAnnouncement(tx))).toBeNull();
  });

  it("rejects a message over 100 characters", async () => {
    const message = await captureErrorText(
      asA((tx) => saveAnnouncement(tx, { message: "x".repeat(101), startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW)),
    );
    expect(message).toMatch(/business_announcements_message_check/);
  });

  it("rejects a message with a newline", async () => {
    const message = await captureErrorText(
      asA((tx) => saveAnnouncement(tx, { message: "Closed\nfor Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW)),
    );
    expect(message).toMatch(/business_announcements_message_single_line_check/);
  });

  it("cannot see or clear another business's announcement", async () => {
    await asA((tx) => saveAnnouncement(tx, { message: "Closed for Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW));

    expect(await asB((tx) => findAnnouncement(tx))).toBeNull();
    await asB((tx) => clearAnnouncement(tx));
    expect(await asA((tx) => findAnnouncement(tx))).toEqual({
      message: "Closed for Diwali",
      startsOn: "2026-11-01",
      endsOn: "2026-11-05",
    });
  });
});

describe("replaceOpeningHours", () => {
  it("replaces the tenant's hours without an onboarding lock", async () => {
    const rows = await asA((tx) =>
      replaceOpeningHours(tx, [
        { dayOfWeek: 0, opensAt: "09:00", closesAt: "17:00", closed: false, openAllDay: false },
        { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
      ]),
    );
    expect(rows).toHaveLength(2);

    const replaced = await asA((tx) =>
      replaceOpeningHours(tx, [{ dayOfWeek: 1, opensAt: null, closesAt: null, closed: false, openAllDay: true }]),
    );
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({ dayOfWeek: 1, openAllDay: true, closed: false });
  });

  it("still saves hours, and the lock call does not error, for a business with no business_profiles row", async () => {
    const profileRows = await dbs.staff.db.select().from(businessProfiles).where(eq(businessProfiles.businessId, businessA));
    expect(profileRows).toEqual([]);

    const rows = await asA((tx) =>
      replaceOpeningHours(tx, [{ dayOfWeek: 2, opensAt: "10:00", closesAt: "18:00", closed: false, openAllDay: false }]),
    );
    expect(rows).toEqual([expect.objectContaining({ dayOfWeek: 2, opensAt: "10:00:00", closesAt: "18:00:00" })]);
  });
});

describe("readSiteFacts", () => {
  it("gathers the time zone, hours, closures and announcement for a business", async () => {
    await setBusinessTimeZone(dbs.staff.db, businessA, "Asia/Kolkata");
    await asA((tx) => replaceOpeningHours(tx, [{ dayOfWeek: 0, opensAt: "09:00", closesAt: "17:00", closed: false, openAllDay: false }]));
    await asA((tx) => addClosure(tx, { startsOn: "2026-12-24", endsOn: "2026-12-26", note: "Holidays" }));
    await asA((tx) => saveAnnouncement(tx, { message: "Closed for Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" }, NOW));

    const facts = await readSiteFacts(dbs.staff.db, businessA);
    expect(facts.timeZone).toBe("Asia/Kolkata");
    expect(facts.hours).toHaveLength(1);
    expect(facts.closures).toHaveLength(1);
    expect(facts.announcement).toEqual({ message: "Closed for Diwali", startsOn: "2026-11-01", endsOn: "2026-11-05" });
  });

  it("returns empty facts for a business with none set", async () => {
    const facts = await readSiteFacts(dbs.staff.db, businessB);
    expect(facts).toEqual({ timeZone: null, hours: [], closures: [], announcement: null });
  });
});
