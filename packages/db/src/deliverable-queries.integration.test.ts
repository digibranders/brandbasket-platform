import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveDeliverables,
  countSiteEvents,
  DeliverableError,
  deleteDeliverable,
  findDeliverableForBusiness,
  insertDeliverable,
  latestMonthlyReport,
  listDeliverablesForBusiness,
  listDeliverablesForStaff,
  listMonthlyReportsForStaff,
  listWaitingPosts,
  moveDeliverable,
  recordSiteEvent,
  removeMonthlyReport,
  updateDeliverableFields,
  upsertMonthlyReport,
  type StoredPicture,
} from "./queries/deliverables";
import type { DeliverableKind } from "./deliverable-states";
import { insertBusiness } from "./queries/onboarding";
import { businessMembers, deliverables, monthlyReports, staffMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "dq-owner";
const OTHER_OWNER = "dq-other-owner";
const STAFF = "dq-staff";
const NOW = new Date("2026-11-10T06:00:00.000Z");

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
  await dbs.staff.db.insert(users).values([OWNER, OTHER_OWNER, STAFF].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })));
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) =>
  withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

async function add(input: { kind?: DeliverableKind; dueOn?: string | null; status?: "planned" | "awaiting_approval"; business?: string; title?: string; picture?: StoredPicture } = {}) {
  const kind = input.kind ?? "post";
  return insertDeliverable(dbs.staff.db, {
    id: input.picture?.id ?? randomUUID(),
    businessId: input.business ?? businessId,
    kind,
    title: input.title ?? "Diwali offer post",
    caption: kind === "post" ? "Fresh smiles this Diwali." : null,
    dueOn: input.dueOn === undefined ? (kind === "post" ? "2026-11-10" : null) : input.dueOn,
    status: input.status,
    staffId: STAFF,
    picture: input.picture ?? null,
  });
}

const pictureFor = (id: string): StoredPicture => ({ id, key: `deliverables/${id}/display`, mimeType: "image/jpeg", bytes: 1000, width: 1080, height: 1080, sha256: "abc" });

describe("the customer's readers", () => {
  it("read their own business's rows only, through withTenantScope", async () => {
    const mine = await add({ status: "awaiting_approval" });
    const theirs = await add({ status: "awaiting_approval", business: otherBusinessId });
    await dbs.staff.db.insert(monthlyReports).values([
      { businessId, service: "social", month: "2026-10-01", url: "https://example.com/mine" },
      { businessId: otherBusinessId, service: "social", month: "2026-10-01", url: "https://example.com/theirs" },
    ]);
    // Even asked for the other business's id, the customer sees nothing of it.
    expect((await asOwner((tx) => listWaitingPosts(tx, businessId))).map((row) => row.id)).toEqual([mine.id]);
    expect(await asOwner((tx) => listWaitingPosts(tx, otherBusinessId))).toEqual([]);
    expect((await asOwner((tx) => findDeliverableForBusiness(tx, businessId, mine.id)))?.id).toBe(mine.id);
    expect(await asOwner((tx) => findDeliverableForBusiness(tx, otherBusinessId, theirs.id))).toBeNull();
    expect(await asOwner((tx) => findDeliverableForBusiness(tx, businessId, theirs.id))).toBeNull();
    expect((await asOwner((tx) => listDeliverablesForBusiness(tx, otherBusinessId, { service: "social", from: "2026-11-01", to: "2026-11-30" })))).toEqual([]);
    expect((await asOwner((tx) => latestMonthlyReport(tx, businessId, "social")))?.url).toBe("https://example.com/mine");
    expect(await asOwner((tx) => latestMonthlyReport(tx, otherBusinessId, "social"))).toBeNull();
    expect(await asOtherOwner((tx) => countSiteEvents(tx, businessId, { from: new Date(0), to: NOW }))).toEqual({ call: 0, whatsapp: 0, form: 0 });
  });

  it("list a window, with a post waiting for approval shown whatever its date, ordered by day then creation", async () => {
    const inside = await add({ dueOn: "2026-11-20" });
    const earlier = await add({ dueOn: "2026-11-02" });
    const outside = await add({ dueOn: "2026-12-05" });
    const waitingOutside = await add({ dueOn: "2026-12-06", status: "awaiting_approval" });
    const edgeStart = await add({ dueOn: "2026-11-01" });
    const edgeEnd = await add({ dueOn: "2026-11-30" });
    const page = await add({ kind: "page", dueOn: "2026-11-15" });
    const rows = await asOwner((tx) => listDeliverablesForBusiness(tx, businessId, { service: "social", from: "2026-11-01", to: "2026-11-30" }));
    expect(rows.map((row) => row.id)).toEqual([edgeStart.id, earlier.id, inside.id, edgeEnd.id, waitingOutside.id]);
    expect(rows.map((row) => row.id)).not.toContain(outside.id);
    expect(rows.map((row) => row.id)).not.toContain(page.id);
    const search = await asOwner((tx) => listDeliverablesForBusiness(tx, businessId, { service: "search", from: "2026-11-01", to: "2026-11-30" }));
    expect(search.map((row) => row.id)).toEqual([page.id]);
  });

  it("do not list a published post outside the window", async () => {
    const post = await add({ dueOn: "2026-10-05", status: "awaiting_approval" });
    await asOwner((tx) => approveDeliverables(tx, [post.id]));
    await moveDeliverable(dbs.staff.db, { id: post.id, businessId, to: "published", now: NOW });
    expect(await asOwner((tx) => listDeliverablesForBusiness(tx, businessId, { service: "social", from: "2026-11-01", to: "2026-11-30" }))).toEqual([]);
  });

  it("list waiting posts by day", async () => {
    const later = await add({ dueOn: "2026-11-20", status: "awaiting_approval" });
    const sooner = await add({ dueOn: "2026-11-12", status: "awaiting_approval" });
    await add({ dueOn: "2026-11-11" });
    expect((await asOwner((tx) => listWaitingPosts(tx, businessId))).map((row) => row.id)).toEqual([sooner.id, later.id]);
  });

  it("return the newest month's report", async () => {
    for (const month of ["2026-08-01", "2026-10-01", "2026-09-01"]) {
      await upsertMonthlyReport(dbs.staff.db, { businessId, service: "search", month, url: `https://example.com/${month}`, staffId: STAFF, now: NOW });
    }
    expect((await asOwner((tx) => latestMonthlyReport(tx, businessId, "search")))?.month).toBe("2026-10-01");
    expect(await asOwner((tx) => latestMonthlyReport(tx, businessId, "social"))).toBeNull();
  });
});

describe("approveDeliverables", () => {
  it("returns how many it approved, and a second call returns 0", async () => {
    const one = await add({ status: "awaiting_approval" });
    const two = await add({ status: "awaiting_approval" });
    const planned = await add();
    expect(await asOwner((tx) => approveDeliverables(tx, [one.id, two.id, planned.id]))).toBe(2);
    expect(await asOwner((tx) => approveDeliverables(tx, [one.id, two.id, planned.id]))).toBe(0);
    const [row] = await dbs.staff.db.select().from(deliverables).where(eq(deliverables.id, one.id));
    expect(row).toMatchObject({ status: "approved", approvedByUserId: OWNER });
  });

  it("will not approve another business's post", async () => {
    const theirs = await add({ status: "awaiting_approval", business: otherBusinessId });
    expect(await asOwner((tx) => approveDeliverables(tx, [theirs.id]))).toBe(0);
  });

  it("names an empty list and a list over 50 as bad requests, and a stranger as not found", async () => {
    await expect(asOwner((tx) => approveDeliverables(tx, []))).rejects.toMatchObject({ name: "DeliverableError", code: "bad_request" });
    await expect(asOwner((tx) => approveDeliverables(tx, Array.from({ length: 51 }, () => randomUUID())))).rejects.toBeInstanceOf(DeliverableError);
    const stranger = withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId }, (tx) => approveDeliverables(tx, [randomUUID()]));
    await expect(stranger).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("the staff writers", () => {
  it("insert sets the service from the kind and starts planned", async () => {
    const post = await add();
    const page = await add({ kind: "page" });
    const listing = await add({ kind: "listing" });
    expect([post, page, listing].map((row) => [row.kind, row.service, row.status])).toEqual([
      ["post", "social", "planned"],
      ["page", "search", "planned"],
      ["listing", "search", "planned"],
    ]);
  });

  it("move to published sets published_at, and refuses an unapproved post with wrong_state", async () => {
    const post = await add({ status: "awaiting_approval" });
    await expect(moveDeliverable(dbs.staff.db, { id: post.id, businessId, to: "published", now: NOW })).rejects.toMatchObject({ name: "DeliverableError", code: "wrong_state" });
    await asOwner((tx) => approveDeliverables(tx, [post.id]));
    const published = await moveDeliverable(dbs.staff.db, { id: post.id, businessId, to: "published", linkUrl: "https://example.com/post", now: NOW });
    expect(published).toMatchObject({ status: "published", publishedAt: NOW, linkUrl: "https://example.com/post" });
    const page = await add({ kind: "page" });
    expect((await moveDeliverable(dbs.staff.db, { id: page.id, businessId, to: "published", now: NOW })).publishedAt).toEqual(NOW);
  });

  it("move refuses approval by staff, and a row of another business as not_found", async () => {
    const post = await add({ status: "awaiting_approval" });
    await expect(moveDeliverable(dbs.staff.db, { id: post.id, businessId, to: "approved", now: NOW })).rejects.toMatchObject({ code: "wrong_state" });
    await expect(moveDeliverable(dbs.staff.db, { id: post.id, businessId: otherBusinessId, to: "planned", now: NOW })).rejects.toMatchObject({ code: "not_found" });
  });

  it("update changes the fields, and hands back the picture key when the picture goes", async () => {
    const id = randomUUID();
    const post = await add({ picture: pictureFor(id) });
    const same = { id: post.id, businessId, title: "A better title", caption: "New words.", dueOn: "2026-11-12", linkUrl: null, now: NOW };
    // Left alone: no key to delete.
    const left = await updateDeliverableFields(dbs.staff.db, same);
    expect(left?.replacedKey).toBeNull();
    expect(left?.row).toMatchObject({ title: "A better title", caption: "New words.", dueOn: "2026-11-12", imageKey: `deliverables/${id}/display` });
    // Replaced: the file is overwritten under the same key, so there is nothing to delete.
    const replaced = await updateDeliverableFields(dbs.staff.db, { ...same, picture: { ...pictureFor(id), sha256: "def" } });
    expect(replaced?.replacedKey).toBeNull();
    expect(replaced?.row.imageSha256).toBe("def");
    // Removed: the old key comes back for the caller to delete.
    const removed = await updateDeliverableFields(dbs.staff.db, { ...same, picture: null });
    expect(removed?.replacedKey).toBe(`deliverables/${id}/display`);
    expect(removed?.row).toMatchObject({ imageKey: null, imageMime: null, imageSha256: null });
    expect(await updateDeliverableFields(dbs.staff.db, { ...same, businessId: otherBusinessId })).toBeNull();
  });

  it("update refuses to change an approved post in place", async () => {
    const post = await add({ status: "awaiting_approval" });
    await asOwner((tx) => approveDeliverables(tx, [post.id]));
    await expect(
      updateDeliverableFields(dbs.staff.db, { id: post.id, businessId, title: "Changed title", caption: post.caption, dueOn: post.dueOn, linkUrl: null, now: NOW }),
    ).rejects.toMatchObject({ code: "wrong_state" });
  });

  it("delete removes only a planned row", async () => {
    const id = randomUUID();
    const planned = await add({ picture: pictureFor(id) });
    const waiting = await add({ status: "awaiting_approval" });
    expect(await deleteDeliverable(dbs.staff.db, { id: waiting.id, businessId })).toBeNull();
    expect(await deleteDeliverable(dbs.staff.db, { id: planned.id, businessId: otherBusinessId })).toBeNull();
    expect(await deleteDeliverable(dbs.staff.db, { id: planned.id, businessId })).toEqual({ imageKey: `deliverables/${id}/display` });
    expect(await deleteDeliverable(dbs.staff.db, { id: planned.id, businessId })).toBeNull();
    expect(await findDeliverableForBusiness(dbs.staff.db, businessId, waiting.id)).not.toBeNull();
  });

  it("list for staff shows every service, drops old published rows, and puts the newest first", async () => {
    const old = await add({ dueOn: "2026-09-01", status: "awaiting_approval" });
    await asOwner((tx) => approveDeliverables(tx, [old.id]));
    await moveDeliverable(dbs.staff.db, { id: old.id, businessId, to: "published", now: NOW });
    const first = await add({ title: "First post here" });
    const page = await add({ kind: "page" });
    await add({ business: otherBusinessId });
    const rows = await listDeliverablesForStaff(dbs.staff.db, businessId, { from: "2026-10-01" });
    expect(rows.map((row) => row.id)).toEqual([page.id, first.id]);
    expect((await listDeliverablesForStaff(dbs.staff.db, businessId, { from: "2026-09-01" })).map((row) => row.id)).toContain(old.id);
  });
});

describe("monthly reports", () => {
  it("upserting twice leaves one row with the second url, and a row can be removed", async () => {
    const input = { businessId, service: "social" as const, month: "2026-10-01", staffId: STAFF, now: NOW };
    await upsertMonthlyReport(dbs.staff.db, { ...input, url: "https://example.com/one" });
    await upsertMonthlyReport(dbs.staff.db, { ...input, url: "https://example.com/two" });
    const rows = await listMonthlyReportsForStaff(dbs.staff.db, businessId, 10);
    expect(rows.map((row) => row.url)).toEqual(["https://example.com/two"]);
    expect(await removeMonthlyReport(dbs.staff.db, { businessId, service: "social", month: "2026-10-01" })).toBe(true);
    expect(await removeMonthlyReport(dbs.staff.db, { businessId, service: "social", month: "2026-10-01" })).toBe(false);
  });

  it("lists the newest month first and honours the limit", async () => {
    for (const month of ["2026-08-01", "2026-10-01", "2026-09-01"]) {
      await upsertMonthlyReport(dbs.staff.db, { businessId, service: "social", month, url: `https://example.com/${month}`, staffId: STAFF, now: NOW });
    }
    expect((await listMonthlyReportsForStaff(dbs.staff.db, businessId, 2)).map((row) => row.month)).toEqual(["2026-10-01", "2026-09-01"]);
  });
});

describe("site events", () => {
  it("count per kind inside [from, to) and not outside, and only for the business", async () => {
    const at = (iso: string) => new Date(iso);
    const from = at("2026-11-01T00:00:00.000Z");
    const to = at("2026-12-01T00:00:00.000Z");
    for (const [kind, when] of [
      ["call", "2026-11-01T00:00:00.000Z"],
      ["call", "2026-11-15T10:00:00.000Z"],
      ["whatsapp", "2026-11-30T23:59:59.000Z"],
      ["form", "2026-11-20T10:00:00.000Z"],
      ["call", "2026-12-01T00:00:00.000Z"],
      ["whatsapp", "2026-10-31T23:59:59.000Z"],
    ] as const) {
      await recordSiteEvent(dbs.staff.db, { businessId, kind, at: at(when) });
    }
    await recordSiteEvent(dbs.staff.db, { businessId: otherBusinessId, kind: "form", at: at("2026-11-10T00:00:00.000Z") });
    expect(await asOwner((tx) => countSiteEvents(tx, businessId, { from, to }))).toEqual({ call: 2, whatsapp: 1, form: 1 });
    expect(await countSiteEvents(dbs.staff.db, otherBusinessId, { from, to })).toEqual({ call: 0, whatsapp: 0, form: 1 });
  });

  it("count nothing as zeros", async () => {
    expect(await countSiteEvents(dbs.staff.db, businessId, { from: new Date(0), to: NOW })).toEqual({ call: 0, whatsapp: 0, form: 0 });
  });
});
