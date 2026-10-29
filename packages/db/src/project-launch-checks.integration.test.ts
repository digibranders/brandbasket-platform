import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listLaunchChecks, missingLaunchChecks, setLaunchCheck, LAUNCH_CHECK_KEYS } from "./queries/project-launch-checks";
import { businesses, businessMembers, projectLaunchChecks, projects, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "plc-staff";
const OTHER_STAFF = "plc-other-staff";
const OWNER = "plc-owner";
const TICKED_AT = new Date("2026-10-28T09:00:00.000Z");
const LATER = new Date("2026-10-29T09:00:00.000Z");

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
    { id: STAFF, name: "Staff", email: "staff-plc@example.com", emailVerified: true },
    { id: OTHER_STAFF, name: "Other staff", email: "other-staff-plc@example.com", emailVerified: true },
    { id: OWNER, name: "Owner", email: "owner-plc@example.com", emailVerified: true },
  ]);
  ({ businessId, projectId } = await makeBusiness("maple-bakery"));
  ({ businessId: otherBusinessId } = await makeBusiness("cedar-clinic"));
});

describe("project launch checks", () => {
  it("ticks a check and lists it with who ticked it and when", async () => {
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "dns_and_https", staffId: STAFF, checked: true, now: TICKED_AT });

    expect(await listLaunchChecks(dbs.staff.db, { projectId, businessId })).toEqual([
      { key: "dns_and_https", checkedByStaffId: STAFF, checkedAt: TICKED_AT },
    ]);
  });

  it("keeps the first tick when the same check is ticked again", async () => {
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "mobile_checked", staffId: STAFF, checked: true, now: TICKED_AT });
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "mobile_checked", staffId: OTHER_STAFF, checked: true, now: LATER });

    expect(await listLaunchChecks(dbs.staff.db, { projectId, businessId })).toEqual([
      { key: "mobile_checked", checkedByStaffId: STAFF, checkedAt: TICKED_AT },
    ]);
  });

  it("unticks a check by removing it, and leaves the others", async () => {
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "key_pages_load", staffId: STAFF, checked: true, now: TICKED_AT });
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "customer_informed", staffId: STAFF, checked: true, now: LATER });
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "key_pages_load", staffId: STAFF, checked: false, now: LATER });

    expect((await listLaunchChecks(dbs.staff.db, { projectId, businessId })).map((row) => row.key)).toEqual(["customer_informed"]);
  });

  it("lists nothing when the business does not own the project", async () => {
    await setLaunchCheck(dbs.staff.db, { projectId, businessId, key: "hostname_configured", staffId: STAFF, checked: true, now: TICKED_AT });

    expect(await listLaunchChecks(dbs.staff.db, { projectId, businessId: otherBusinessId })).toEqual([]);
  });

  it("reports the checks not yet ticked, in the console's order", () => {
    expect(missingLaunchChecks([])).toEqual(LAUNCH_CHECK_KEYS);
    expect(missingLaunchChecks(["customer_informed", "production_deployment"])).toEqual(
      LAUNCH_CHECK_KEYS.filter((key) => key !== "customer_informed" && key !== "production_deployment"),
    );
    expect(missingLaunchChecks([...LAUNCH_CHECK_KEYS])).toEqual([]);
  });

  it("gives the customer's role no access to the table", async () => {
    expect(await captureErrorText(dbs.app.db.select().from(projectLaunchChecks))).toMatch(/permission denied/);
  });
});
