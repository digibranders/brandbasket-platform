import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listPreviewVersions, recordPreviewVersion } from "./queries/project-preview-versions";
import { businesses, businessMembers, projects, projectPreviewVersions, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "ppv-staff";
const OWNER = "ppv-owner";
const SENT_FIRST = new Date("2026-10-26T10:00:00.000Z");
const SENT_SECOND = new Date("2026-10-27T10:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let projectId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function makeBusiness(slug: string): Promise<{ readonly businessId: string; readonly projectId: string }> {
  const [business] = await dbs.owner.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  await dbs.owner.db.insert(businessMembers).values({ businessId: business.id, userId: OWNER, role: "owner" });
  const [project] = await dbs.owner.db.insert(projects).values({ businessId: business.id, status: "preview" }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  return { businessId: business.id, projectId: project.id };
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff-ppv@example.com", emailVerified: true },
    { id: OWNER, name: "Owner", email: "owner-ppv@example.com", emailVerified: true },
  ]);
  ({ businessId, projectId } = await makeBusiness("lotus-studio"));
  ({ businessId: otherBusinessId } = await makeBusiness("juniper-yoga"));
});

describe("project preview versions", () => {
  it("numbers each send from 1 and lists them newest first", async () => {
    const first = await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: "https://lotus-one.example.com", sentAt: SENT_FIRST, staffId: STAFF });
    const second = await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: "https://lotus-two.example.com", sentAt: SENT_SECOND, staffId: null });

    expect([first, second]).toEqual([1, 2]);
    expect(await listPreviewVersions(dbs.staff.db, { projectId, businessId })).toEqual([
      { version: 2, previewUrl: "https://lotus-two.example.com", sentAt: SENT_SECOND, sentByStaffId: null },
      { version: 1, previewUrl: "https://lotus-one.example.com", sentAt: SENT_FIRST, sentByStaffId: STAFF },
    ]);
  });

  it("gives every send its own number when two sends run at once", async () => {
    const sends = await Promise.all([
      recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: "https://lotus-a.example.com", sentAt: SENT_FIRST, staffId: STAFF }),
      recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: "https://lotus-b.example.com", sentAt: SENT_SECOND, staffId: STAFF }),
    ]);

    expect(sends.sort()).toEqual([1, 2]);
    const rows = await dbs.owner.db.select().from(projectPreviewVersions).where(eq(projectPreviewVersions.projectId, projectId));
    expect(rows.map((row) => row.version).sort()).toEqual([1, 2]);
  });

  it("lists nothing when the business does not own the project", async () => {
    await recordPreviewVersion(dbs.staff.db, { projectId, businessId, previewUrl: "https://lotus-one.example.com", sentAt: SENT_FIRST, staffId: STAFF });

    expect(await listPreviewVersions(dbs.staff.db, { projectId, businessId: otherBusinessId })).toEqual([]);
  });

  it("refuses a send for a business that does not own the project", async () => {
    expect(
      await captureErrorText(
        recordPreviewVersion(dbs.staff.db, { projectId, businessId: otherBusinessId, previewUrl: "https://lotus-one.example.com", sentAt: SENT_FIRST, staffId: STAFF }),
      ),
    ).toMatch(/project_preview_versions_project_business_fk/);
  });

  it("gives the customer's role no access to the table", async () => {
    expect(await captureErrorText(dbs.app.db.select().from(projectPreviewVersions))).toMatch(/permission denied/);
  });
});
