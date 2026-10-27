import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listActivityForBusiness, listRecentActivity, recordActivity } from "./queries/activity";
import { businessActivity, businesses, businessMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-activity";

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
      { slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" },
      { slug: "other-shop", name: "Other Shop", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessId = rows.find((row) => row.slug === "harbour-bakery")?.id ?? "";
  otherBusinessId = rows.find((row) => row.slug === "other-shop")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
});

describe("activity", () => {
  it("records a staff row and lists the business's rows newest first, with empty data and hidden from the client by default", async () => {
    await recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "project.preview_sent", summary: "Sent the preview" });
    await recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "project.marked_live", summary: "Marked the website live", data: { notified: "emailed" } });
    await recordActivity(dbs.staff.db, { businessId: otherBusinessId, actorKind: "system", actorId: null, kind: "other.thing", summary: "Something elsewhere" });

    const rows = await listActivityForBusiness(dbs.staff.db, businessId, 10);
    expect(rows.map((row) => row.kind)).toEqual(["project.marked_live", "project.preview_sent"]);
    expect(rows[1]).toMatchObject({ actorKind: "staff", actorId: "staff-1", data: {}, visibleToClient: false });
    expect(rows[0]?.data).toEqual({ notified: "emailed" });
  });

  it("lists recent activity across every business, including rows with no business", async () => {
    await recordActivity(dbs.staff.db, { businessId: null, actorKind: "staff", actorId: "staff-1", kind: "pricing.saved", summary: "Saved prices" });
    await recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "lead.updated", summary: "Updated an enquiry" });
    expect((await listRecentActivity(dbs.staff.db, 10)).map((row) => row.kind)).toEqual(["lead.updated", "pricing.saved"]);
  });

  it("returns nothing for an id that is not a business id", async () => {
    expect(await listActivityForBusiness(dbs.staff.db, "not-a-uuid", 10)).toEqual([]);
  });

  it("lets the customer's role read only its own business's rows marked visible", async () => {
    await recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "a.hidden", summary: "Hidden from the client" });
    await recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "a.visible", summary: "Shown to the client", visibleToClient: true });
    await recordActivity(dbs.staff.db, { businessId: otherBusinessId, actorKind: "staff", actorId: "staff-1", kind: "b.visible", summary: "Shown to the other client", visibleToClient: true });

    const seen = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select({ kind: businessActivity.kind }).from(businessActivity));
    expect(seen.map((row) => row.kind)).toEqual(["a.visible"]);
  });

  it("refuses a write from the customer's role", async () => {
    await expect(
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.insert(businessActivity).values({ businessId, actorKind: "client", actorId: OWNER, kind: "x.y", summary: "Not allowed" }),
      ),
    ).rejects.toThrow();
  });

  it("refuses an empty summary", async () => {
    await expect(recordActivity(dbs.staff.db, { businessId, actorKind: "staff", actorId: "staff-1", kind: "x.y", summary: "" })).rejects.toThrow();
  });
});
