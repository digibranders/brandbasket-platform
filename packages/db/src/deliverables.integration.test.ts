import { randomUUID } from "node:crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { canMoveDeliverable, DELIVERABLE_STATUSES, serviceOfKind, type DeliverableKind, type DeliverableStatus } from "./deliverable-states";
import { insertBusiness } from "./queries/onboarding";
import { businessMembers, deliverables, monthlyReports, siteEvents, staffMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "dl-owner";
const OTHER_OWNER = "dl-other-owner";
const STRANGER = "dl-stranger";
const STAFF = "dl-staff";
const DAY = "2026-11-10";

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
  await dbs.staff.db.insert(users).values(
    [OWNER, OTHER_OWNER, STRANGER, STAFF].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })),
  );
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
const asStranger = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: STRANGER, businessId }, work);

/** Postgres reports a missing privilege as 42501 and a refused check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

const uuidArray = (ids: readonly string[]): SQL =>
  ids.length === 0 ? sql`'{}'::uuid[]` : sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;

/** The customer's one door. */
async function approve(as: typeof asOwner, ids: readonly string[]): Promise<number> {
  const result = await as((tx) => tx.execute<{ n: number }>(sql`select approve_deliverables(${uuidArray(ids)}) as n`));
  return Number(result.rows[0]?.n);
}

interface RowInput {
  readonly kind?: DeliverableKind;
  readonly status?: "planned" | "awaiting_approval";
  readonly business?: string;
  readonly id?: string;
}

/** A row written the way staff write it. */
async function insertRow(input: RowInput = {}): Promise<string> {
  const kind = input.kind ?? "post";
  const id = input.id ?? randomUUID();
  await dbs.staff.db.insert(deliverables).values({
    id,
    businessId: input.business ?? businessId,
    service: serviceOfKind(kind),
    kind,
    title: "Diwali offer post",
    caption: kind === "post" ? "Fresh smiles this Diwali." : null,
    dueOn: kind === "post" ? DAY : null,
    status: input.status ?? "planned",
    createdByStaffId: STAFF,
  });
  return id;
}

const statusOf = async (id: string): Promise<string | undefined> =>
  (await dbs.staff.db.select({ status: deliverables.status }).from(deliverables).where(eq(deliverables.id, id)))[0]?.status;

const staffUpdate = (id: string, set: SQL) => dbs.staff.db.execute(sql`update deliverables set ${set} where id = ${id}`);

/** Puts a new row in any state its kind can reach, through the allowed path only (a post is approved by the function). */
async function rowIn(kind: DeliverableKind, status: DeliverableStatus): Promise<string> {
  if (status === "planned") return insertRow({ kind });
  if (kind !== "post") {
    if (status !== "published") throw new Error(`a ${kind} cannot be ${status}`);
    const id = await insertRow({ kind });
    await staffUpdate(id, sql`status = 'published', published_at = now()`);
    return id;
  }
  const id = await insertRow({ kind, status: "awaiting_approval" });
  if (status === "awaiting_approval") return id;
  expect(await approve(asOwner, [id])).toBe(1);
  if (status === "published") await staffUpdate(id, sql`status = 'published', published_at = now()`);
  return id;
}

describe("what the customer can read and write", () => {
  it("reads only its own rows, in each table", async () => {
    for (const business of [businessId, otherBusinessId]) {
      await insertRow({ business });
      await dbs.staff.db.insert(monthlyReports).values({ businessId: business, service: "social", month: "2026-10-01", url: "https://example.com/report" });
      await dbs.staff.db.insert(siteEvents).values({ businessId: business, kind: "call" });
    }
    for (const table of [deliverables, monthlyReports, siteEvents]) {
      const mine = await asOwner((tx) => tx.select({ businessId: table.businessId }).from(table));
      expect(mine.map((row) => row.businessId)).toEqual([businessId]);
      const theirs = await asOtherOwner((tx) => tx.select({ businessId: table.businessId }).from(table));
      expect(theirs.map((row) => row.businessId)).toEqual([otherBusinessId]);
    }
  });

  it("cannot write any of the three tables by any statement", async () => {
    const id = await insertRow();
    const attempts = [
      sql`insert into deliverables (id, business_id, service, kind, title, due_on) values (gen_random_uuid(), ${businessId}, 'social', 'post', 'A new post', ${DAY})`,
      sql`update deliverables set title = 'Changed title' where id = ${id}`,
      sql`update deliverables set status = 'approved', approved_at = now(), approved_by_user_id = ${OWNER} where id = ${id}`,
      sql`delete from deliverables where id = ${id}`,
      sql`insert into monthly_reports (id, business_id, service, month, url) values (gen_random_uuid(), ${businessId}, 'social', '2026-10-01', 'https://example.com/r')`,
      sql`update monthly_reports set url = 'https://example.com/changed'`,
      sql`delete from monthly_reports`,
      sql`insert into site_events (id, business_id, kind) values (gen_random_uuid(), ${businessId}, 'call')`,
      sql`update site_events set kind = 'form'`,
      sql`delete from site_events`,
    ];
    for (const attempt of attempts) {
      expect(await sqlState(() => asOwner((tx) => tx.execute(attempt))), String(attempt.queryChunks[0])).toBe("42501");
    }
    expect(await statusOf(id)).toBe("planned");
  });
});

describe("what staff can write", () => {
  it("inserts a post, and the trigger nulls any approval it tries to set", async () => {
    const id = randomUUID();
    await dbs.staff.db.insert(deliverables).values({
      id,
      businessId,
      service: "social",
      kind: "post",
      title: "Diwali offer post",
      dueOn: DAY,
      status: "awaiting_approval",
      approvedAt: new Date(),
      approvedByUserId: OWNER,
    });
    const [row] = await dbs.staff.db.select().from(deliverables).where(eq(deliverables.id, id));
    expect(row).toMatchObject({ status: "awaiting_approval", approvedAt: null, approvedByUserId: null });
  });

  it("cannot insert an approved or published row", async () => {
    for (const status of ["approved", "published"] as const) {
      expect(
        await sqlState(async () => {
          await dbs.staff.db.insert(deliverables).values({
            businessId,
            service: "social",
            kind: "post",
            title: "Diwali offer post",
            dueOn: DAY,
            status,
            approvedAt: new Date(),
            approvedByUserId: OWNER,
            publishedAt: new Date(),
          });
        }),
        status,
      ).toBe("23514");
    }
  });

  it("cannot write the approval columns, cannot approve by status, and can change a title", async () => {
    const id = await insertRow({ status: "awaiting_approval" });
    expect(await sqlState(() => staffUpdate(id, sql`approved_at = now()`))).toBe("42501");
    expect(await sqlState(() => staffUpdate(id, sql`approved_by_user_id = ${OWNER}`))).toBe("42501");
    expect(await sqlState(() => staffUpdate(id, sql`status = 'approved'`))).toBe("23514");
    expect(await statusOf(id)).toBe("awaiting_approval");
    await staffUpdate(id, sql`title = 'A better title'`);
    const [row] = await dbs.staff.db.select().from(deliverables).where(eq(deliverables.id, id));
    expect(row?.title).toBe("A better title");
  });

  it("cannot move a row to another business", async () => {
    const id = await insertRow();
    expect(await sqlState(() => staffUpdate(id, sql`business_id = ${otherBusinessId}`))).toBe("42501");
  });

  it("can delete a row", async () => {
    const id = await insertRow();
    await dbs.staff.db.delete(deliverables).where(eq(deliverables.id, id));
    expect(await statusOf(id)).toBeUndefined();
  });
});

describe("approve_deliverables", () => {
  it("approves its own business's awaiting posts only, and counts what it approved", async () => {
    const awaiting = await insertRow({ status: "awaiting_approval" });
    const planned = await insertRow();
    const otherAwaiting = await insertRow({ status: "awaiting_approval", business: otherBusinessId });
    const page = await insertRow({ kind: "page" });
    expect(await approve(asOwner, [awaiting, planned, otherAwaiting, page])).toBe(1);
    expect(await statusOf(awaiting)).toBe("approved");
    expect(await statusOf(planned)).toBe("planned");
    expect(await statusOf(otherAwaiting)).toBe("awaiting_approval");
    expect(await statusOf(page)).toBe("planned");
    const [row] = await dbs.staff.db.select().from(deliverables).where(eq(deliverables.id, awaiting));
    expect(row?.approvedByUserId).toBe(OWNER);
    expect(row?.approvedAt).toBeInstanceOf(Date);
    // A second call finds nothing awaiting.
    expect(await approve(asOwner, [awaiting])).toBe(0);
  });

  it("refuses a person who is not a member of the business", async () => {
    const id = await insertRow({ status: "awaiting_approval" });
    expect(await sqlState(() => approve(asStranger, [id]))).toBe("42501");
    expect(await statusOf(id)).toBe("awaiting_approval");
  });

  it("refuses an empty list and a list of more than 50", async () => {
    expect(await sqlState(() => approve(asOwner, []))).toBe("23514");
    expect(await sqlState(() => approve(asOwner, Array.from({ length: 51 }, () => randomUUID())))).toBe("23514");
    expect(await approve(asOwner, Array.from({ length: 50 }, () => randomUUID()))).toBe(0);
  });

  it("cannot be called by staff", async () => {
    const id = await insertRow({ status: "awaiting_approval" });
    expect(await sqlState(() => dbs.staff.db.execute(sql`select approve_deliverables(${uuidArray([id])})`))).toBe("42501");
  });
});

describe("the arrows", () => {
  for (const kind of ["post", "page", "listing"] as const) {
    it(`lets a ${kind} move exactly the way canMoveDeliverable says, with approval only through the function`, async () => {
      const reachable = DELIVERABLE_STATUSES.filter((status) => kind === "post" || status === "planned" || status === "published");
      for (const from of reachable) {
        for (const to of DELIVERABLE_STATUSES) {
          const id = await rowIn(kind, from);
          const staffCanDo = canMoveDeliverable(kind, from, to) && (to !== "approved" || from === "approved");
          const set = to === "published" ? sql`status = ${to}, published_at = now()` : sql`status = ${to}`;
          const state = await sqlState(() => staffUpdate(id, set));
          expect(state, `${kind} ${from} to ${to}`).toBe(staffCanDo ? undefined : "23514");
          expect(await statusOf(id), `${kind} ${from} to ${to}`).toBe(staffCanDo ? to : from);
        }
      }
    });
  }

  it("cannot start a page or listing waiting for approval", async () => {
    expect(await sqlState(() => insertRow({ kind: "page", status: "awaiting_approval" }))).toBe("23514");
    expect(await sqlState(() => insertRow({ kind: "listing", status: "awaiting_approval" }))).toBe("23514");
  });

  it("does not let a post be published unapproved, and a published row needs its time", async () => {
    const planned = await insertRow();
    const awaiting = await insertRow({ status: "awaiting_approval" });
    expect(await sqlState(() => staffUpdate(planned, sql`status = 'published', published_at = now()`))).toBe("23514");
    expect(await sqlState(() => staffUpdate(awaiting, sql`status = 'published', published_at = now()`))).toBe("23514");
    const approved = await rowIn("post", "approved");
    expect(await sqlState(() => staffUpdate(approved, sql`status = 'published'`))).toBe("23514");
    await staffUpdate(approved, sql`status = 'published', published_at = now()`);
    expect(await statusOf(approved)).toBe("published");
  });
});

describe("an approved post", () => {
  const picture = (id: string) =>
    sql`image_key = ${`deliverables/${id}/display`}, image_mime = 'image/jpeg', image_bytes = 1000, image_width = 1080, image_height = 1080, image_sha256 = 'abc'`;

  it("cannot have its words, picture or date changed in place", async () => {
    const id = await rowIn("post", "approved");
    expect(await sqlState(() => staffUpdate(id, sql`title = 'Changed title'`))).toBe("23514");
    expect(await sqlState(() => staffUpdate(id, sql`caption = 'Changed words'`))).toBe("23514");
    expect(await sqlState(() => staffUpdate(id, sql`due_on = '2026-12-01'`))).toBe("23514");
    expect(await sqlState(() => staffUpdate(id, picture(id)))).toBe("23514");
    // A change that touches nothing the customer approved is fine.
    await staffUpdate(id, sql`link_url = 'https://example.com/post'`);
  });

  it("goes back to awaiting approval with the approval cleared, and the owner approves it again", async () => {
    const id = await rowIn("post", "approved");
    await staffUpdate(id, sql`status = 'awaiting_approval', title = 'Changed title'`);
    const [row] = await dbs.staff.db.select().from(deliverables).where(eq(deliverables.id, id));
    expect(row).toMatchObject({ status: "awaiting_approval", title: "Changed title", approvedAt: null, approvedByUserId: null });
    expect(await approve(asOwner, [id])).toBe(1);
    expect(await statusOf(id)).toBe("approved");
  });
});

describe("identity", () => {
  it("is frozen: staff have no right to the columns, and the trigger holds even for the table owner", async () => {
    const id = await insertRow();
    const changes = [sql`business_id = ${otherBusinessId}`, sql`kind = 'page'`, sql`service = 'search'`, sql`id = ${randomUUID()}`];
    for (const change of changes) {
      expect(await sqlState(() => staffUpdate(id, change))).toBe("42501");
      expect(await sqlState(() => dbs.owner.db.execute(sql`update deliverables set ${change} where id = ${id}`))).toBe("23514");
    }
    expect(await statusOf(id)).toBe("planned");
  });
});

describe("the checks", () => {
  const insertPost = (values: Partial<typeof deliverables.$inferInsert>) =>
    sqlState(async () => {
      await dbs.staff.db.insert(deliverables).values({ businessId, service: "social", kind: "post", title: "Diwali offer post", dueOn: DAY, ...values });
    });
  const insertPage = (values: Partial<typeof deliverables.$inferInsert>) =>
    sqlState(async () => {
      await dbs.staff.db.insert(deliverables).values({ businessId, service: "search", kind: "page", title: "Faster home page", ...values });
    });

  it("refuses a page with a caption or a picture", async () => {
    const id = randomUUID();
    expect(await insertPage({ caption: "Words" })).toBe("23514");
    expect(
      await insertPage({ id, imageKey: `deliverables/${id}/display`, imageMime: "image/jpeg", imageBytes: 1, imageWidth: 1, imageHeight: 1, imageSha256: "a" }),
    ).toBe("23514");
    expect(await insertPage({})).toBeUndefined();
  });

  it("refuses a post with no date, and a kind that does not match the service", async () => {
    expect(await insertPost({ dueOn: null })).toBe("23514");
    expect(await insertPost({ service: "search" })).toBe("23514");
    expect(await insertPage({ service: "social" })).toBe("23514");
  });

  it("refuses a title that is too short or too long", async () => {
    expect(await insertPost({ title: "  ab " })).toBe("23514");
    expect(await insertPost({ title: "x".repeat(141) })).toBe("23514");
    expect(await insertPost({ caption: "x".repeat(601) })).toBe("23514");
  });

  it("refuses a link that is not https", async () => {
    expect(await insertPost({ linkUrl: "http://example.com/post" })).toBe("23514");
    expect(await insertPost({ linkUrl: "https://example.com/post" })).toBeUndefined();
  });

  it("holds the picture to its own key and to all six columns or none", async () => {
    const id = randomUUID();
    const full = { imageMime: "image/jpeg", imageBytes: 1000, imageWidth: 1080, imageHeight: 1080, imageSha256: "abc" };
    expect(await insertPost({ id, imageKey: "deliverables/someone-else/display", ...full })).toBe("23514");
    expect(await insertPost({ id, imageKey: `deliverables/${id}/display`, imageMime: null })).toBe("23514");
    expect(await insertPost({ id, imageKey: `deliverables/${id}/display`, ...full })).toBeUndefined();
  });

  it("keeps a report to the first of a month, https, and one per business, service and month", async () => {
    const report = { businessId, service: "social" as const, month: "2026-10-01", url: "https://example.com/report" };
    const insertReport = (values: Partial<typeof monthlyReports.$inferInsert>) =>
      sqlState(async () => {
        await dbs.staff.db.insert(monthlyReports).values({ ...report, ...values });
      });
    expect(await insertReport({ month: "2026-10-15" })).toBe("23514");
    expect(await insertReport({ url: "http://example.com/report" })).toBe("23514");
    expect(await insertReport({})).toBeUndefined();
    expect(await insertReport({ url: "https://example.com/second" })).toBe("23505");
    await dbs.staff.db
      .insert(monthlyReports)
      .values({ ...report, url: "https://example.com/second" })
      .onConflictDoUpdate({ target: [monthlyReports.businessId, monthlyReports.service, monthlyReports.month], set: { url: "https://example.com/second" } });
    const rows = await dbs.staff.db.select().from(monthlyReports);
    expect(rows.map((row) => row.url)).toEqual(["https://example.com/second"]);
  });
});

describe("site events", () => {
  it("refuses a kind that is not a call, a WhatsApp tap or a form", async () => {
    expect(await sqlState(async () => void (await dbs.staff.db.execute(sql`insert into site_events (id, business_id, kind) values (gen_random_uuid(), ${businessId}, 'visit')`)))).toBe("23514");
  });

  it("lets staff insert one, and shows the owner its own only", async () => {
    await dbs.staff.db.insert(siteEvents).values({ businessId, kind: "whatsapp" });
    await dbs.staff.db.insert(siteEvents).values({ businessId: otherBusinessId, kind: "form" });
    expect((await asOwner((tx) => tx.select().from(siteEvents))).map((row) => row.kind)).toEqual(["whatsapp"]);
  });
});
