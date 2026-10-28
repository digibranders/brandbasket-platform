import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import {
  deleteSaltsBefore,
  deleteSiteHitsBefore,
  ensureSiteKey,
  findBusinessBySiteKey,
  generateSiteKey,
  getDailySalt,
  getSiteKey,
  insertSiteHit,
  lastSiteHitAt,
  listLiveHostnames,
  listSiteHits,
  type NewSiteHit,
} from "./queries/site-hits";
import { businessMembers, domains, siteHits, siteKeys, users, visitorSalts } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "sh-owner";
const OTHER_OWNER = "sh-other-owner";
const HASH = "0123456789abcdef0123456789abcdef";

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
  await dbs.staff.db.insert(users).values([OWNER, OTHER_OWNER].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })));
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const staff = () => dbs.staff.db;
const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);

/** Postgres reports a missing privilege as 42501 and a refused check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 4, 0, 0) + minutes * 60_000);
const hit = (overrides: Partial<NewSiteHit> = {}): NewSiteHit => ({
  businessId,
  at: at(0),
  kind: "pageview",
  path: "/",
  referrerHost: null,
  channel: "direct",
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  device: "desktop",
  country: "IN",
  label: null,
  visitorHash: HASH,
  engagedMs: null,
  scrollPct: null,
  ...overrides,
});

describe("site keys", () => {
  it("makes a key that is public-safe and different each time", () => {
    const first = generateSiteKey();
    expect(first).toMatch(/^bbk_[A-Za-z0-9]{24}$/);
    expect(generateSiteKey()).not.toBe(first);
  });

  it("gives a business one key and returns the same one on every later ask, even at once", async () => {
    const [a, b] = await Promise.all([ensureSiteKey(staff(), businessId), ensureSiteKey(staff(), businessId)]);
    expect(a.key).toBe(b.key);
    expect((await ensureSiteKey(staff(), businessId)).key).toBe(a.key);
    expect(await staff().select().from(siteKeys)).toHaveLength(1);
  });

  it("gives each business its own, and finds the owner of a key", async () => {
    const mine = await ensureSiteKey(staff(), businessId);
    const theirs = await ensureSiteKey(staff(), otherBusinessId);
    expect(mine.key).not.toBe(theirs.key);
    expect(await findBusinessBySiteKey(staff(), mine.key)).toBe(businessId);
    expect(await findBusinessBySiteKey(staff(), theirs.key)).toBe(otherBusinessId);
    expect(await findBusinessBySiteKey(staff(), "bbk_unknownunknownunknown")).toBeNull();
  });

  it("shows a customer their own key and nobody else's, and lets them change nothing", async () => {
    const mine = await ensureSiteKey(staff(), businessId);
    await ensureSiteKey(staff(), otherBusinessId);
    expect((await asOwner((tx) => getSiteKey(tx, businessId)))?.key).toBe(mine.key);
    expect(await asOwner((tx) => getSiteKey(tx, otherBusinessId))).toBeNull();
    expect(await sqlState(() => asOwner((tx) => tx.update(siteKeys).set({ key: "bbk_abcdefghijklmnop" })))).toBe("42501");
  });

  it("refuses a key in the wrong shape", async () => {
    expect(await sqlState(() => ensureSiteKey(staff(), businessId, () => "not-a-key"))).toBe("23514");
  });
});

describe("daily salts", () => {
  it("makes one salt per day and returns it again, even at once", async () => {
    const [a, b] = await Promise.all([getDailySalt(staff(), "2026-10-05"), getDailySalt(staff(), "2026-10-05")]);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(await getDailySalt(staff(), "2026-10-05")).toBe(a);
    expect(await getDailySalt(staff(), "2026-10-06")).not.toBe(a);
    expect(await staff().select().from(visitorSalts)).toHaveLength(2);
  });

  it("deletes the salts of days before a given day, so old hashes can never be matched again", async () => {
    await getDailySalt(staff(), "2026-10-03");
    await getDailySalt(staff(), "2026-10-04");
    await getDailySalt(staff(), "2026-10-05");
    expect(await deleteSaltsBefore(staff(), "2026-10-04")).toBe(1);
    expect((await staff().select().from(visitorSalts)).map((row) => row.day).sort()).toEqual(["2026-10-04", "2026-10-05"]);
  });

  it("is private: a customer cannot read the salts", async () => {
    await getDailySalt(staff(), "2026-10-05");
    expect(await sqlState(() => asOwner((tx) => tx.select().from(visitorSalts)))).toBe("42501");
  });
});

describe("site hits", () => {
  it("lists a business's hits in a window, from included and to excluded, oldest first", async () => {
    await insertSiteHit(staff(), hit({ at: at(10), path: "/b" }));
    await insertSiteHit(staff(), hit({ at: at(0), path: "/a" }));
    await insertSiteHit(staff(), hit({ at: at(20), path: "/c" }));
    await insertSiteHit(staff(), hit({ at: at(5), businessId: otherBusinessId, path: "/other" }));
    expect((await listSiteHits(staff(), businessId, at(0), at(20))).map((row) => row.path)).toEqual(["/a", "/b"]);
  });

  it("keeps every field of a hit", async () => {
    await insertSiteHit(staff(), hit({ kind: "engagement", path: "/about", referrerHost: "google.com", channel: "search", utmSource: "google", utmMedium: "organic", utmCampaign: "diwali", device: "mobile", country: "US", label: "x", engagedMs: 4200, scrollPct: 60 }));
    expect((await listSiteHits(staff(), businessId, at(-1), at(1)))[0]).toMatchObject({
      kind: "engagement", path: "/about", referrerHost: "google.com", channel: "search", utmSource: "google", utmMedium: "organic", utmCampaign: "diwali", device: "mobile", country: "US", label: "x", visitorHash: HASH, engagedMs: 4200, scrollPct: 60,
    });
  });

  it("refuses values the checks do not allow", async () => {
    const bad: Partial<NewSiteHit>[] = [
      { kind: "purchase" as never },
      { channel: "radio" as never },
      { device: "watch" as never },
      { path: "no-slash" },
      { path: `/${"a".repeat(200)}` },
      { country: "in" },
      { visitorHash: "short" },
      { scrollPct: 101 },
      { engagedMs: -1 },
      { utmCampaign: "x".repeat(61) },
    ];
    for (const override of bad) expect(await sqlState(() => insertSiteHit(staff(), hit(override))), JSON.stringify(override)).toBe("23514");
  });

  it("is never updated, and a customer cannot touch it", async () => {
    await insertSiteHit(staff(), hit());
    expect(await sqlState(() => staff().update(siteHits).set({ path: "/x" }).where(eq(siteHits.businessId, businessId)))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.select().from(siteHits)))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => insertSiteHit(tx, hit())))).toBe("42501");
  });

  it("deletes hits older than a cutoff and says how many", async () => {
    await insertSiteHit(staff(), hit({ at: at(0) }));
    await insertSiteHit(staff(), hit({ at: at(10) }));
    await insertSiteHit(staff(), hit({ at: at(20), businessId: otherBusinessId }));
    expect(await deleteSiteHitsBefore(staff(), at(15))).toBe(2);
    expect((await staff().select().from(siteHits)).map((row) => row.at.toISOString())).toEqual([at(20).toISOString()]);
  });

  it("tells when a business last sent a hit", async () => {
    expect(await lastSiteHitAt(staff(), businessId)).toBeNull();
    await insertSiteHit(staff(), hit({ at: at(0) }));
    await insertSiteHit(staff(), hit({ at: at(30) }));
    await insertSiteHit(staff(), hit({ at: at(99), businessId: otherBusinessId }));
    expect(await lastSiteHitAt(staff(), businessId)).toEqual(at(30));
  });
});

describe("live hostnames", () => {
  it("lists a business's hostnames that have not been removed, and no one else's", async () => {
    await staff().insert(domains).values([
      { businessId, hostname: "SaiDental.in" },
      { businessId, hostname: "old.example", isPrimary: false, removedAt: at(0) },
      { businessId, hostname: "www.saidental.in", isPrimary: false },
      { businessId: otherBusinessId, hostname: "birch.example" },
    ]);
    expect(await listLiveHostnames(staff(), businessId)).toEqual(["saidental.in", "www.saidental.in"]);
    expect(await listLiveHostnames(staff(), "019a0000-0000-7000-8000-000000000000")).toEqual([]);
  });
});
