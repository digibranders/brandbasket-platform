import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findBusinessWebsiteUrl, InvalidWebsiteUrlError, setBusinessWebsiteUrl } from "./queries/business-website";
import { businesses, businessMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-1";
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
  await dbs.staff.db.insert(users).values({ id: OWNER, name: "Riley Owner", email: "riley@example.com" });
  const rows = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "harbour", name: "Harbour", currency: "INR" },
      { slug: "other", name: "Other", currency: "USD" },
    ])
    .returning({ id: businesses.id });
  businessId = rows[0]!.id;
  otherBusinessId = rows[1]!.id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
});

describe("business website address", () => {
  it("is null until staff set it, and normalised to an origin when they do", async () => {
    expect(await findBusinessWebsiteUrl(dbs.staff.db, businessId)).toBeNull();
    await setBusinessWebsiteUrl(dbs.staff.db, businessId, "https://Harbour-Site.vercel.app/");
    expect(await findBusinessWebsiteUrl(dbs.staff.db, businessId)).toBe("https://harbour-site.vercel.app");
  });

  it("can be cleared", async () => {
    await setBusinessWebsiteUrl(dbs.staff.db, businessId, "https://harbour.example");
    await setBusinessWebsiteUrl(dbs.staff.db, businessId, null);
    expect(await findBusinessWebsiteUrl(dbs.staff.db, businessId)).toBeNull();
  });

  it.each(["http://harbour.example", "https://harbour.example/blog", "ftp://x", "not a url", "https://"])(
    "refuses %j",
    async (value) => {
      await expect(setBusinessWebsiteUrl(dbs.staff.db, businessId, value)).rejects.toBeInstanceOf(InvalidWebsiteUrlError);
    },
  );

  it("is readable by the business's own customer, and not another's", async () => {
    await setBusinessWebsiteUrl(dbs.staff.db, businessId, "https://harbour.example");
    await setBusinessWebsiteUrl(dbs.staff.db, otherBusinessId, "https://other.example");
    const own = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findBusinessWebsiteUrl(tx, businessId));
    const other = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
      findBusinessWebsiteUrl(tx, otherBusinessId),
    );
    expect(own).toBe("https://harbour.example");
    expect(other).toBeNull();
  });
});
