import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordSignupLead } from "./queries/leads";
import { findBusinessAlertDetails } from "./queries/payment-alerts";
import { businessMembers, businesses, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

async function addCustomer(phone: string | null): Promise<string> {
  const [user] = await dbs.staff.db.insert(users).values({ id: "user-asha", name: "Asha Rao", email: "asha@example.com", phoneNumber: phone }).returning({ id: users.id });
  const [business] = await dbs.staff.db.insert(businesses).values({ slug: "rao-clinic", name: "Rao Clinic", currency: "INR" }).returning({ id: businesses.id });
  await dbs.staff.db.insert(businessMembers).values({ businessId: business?.id ?? "", userId: user?.id ?? "", role: "owner" });
  return business?.id ?? "";
}

describe("findBusinessAlertDetails", () => {
  it("gives the owner's name, email and the number on their account", async () => {
    const businessId = await addCustomer("+919820011111");
    const found = await findBusinessAlertDetails(dbs.staff.db, businessId);
    expect(found?.owner).toEqual({ name: "Asha Rao", email: "asha@example.com", phone: "+919820011111" });
  });

  it("falls back to the number they gave on their enquiry when the account has none", async () => {
    const businessId = await addCustomer(null);
    await recordSignupLead(dbs.staff.db, { name: "Asha", businessName: "Rao Clinic", email: "asha@example.com", businessId, plan: "managed", phone: "+919820022222" });
    expect((await findBusinessAlertDetails(dbs.staff.db, businessId))?.owner.phone).toBe("+919820022222");
  });

  it("is null for a business that does not exist", async () => {
    expect(await findBusinessAlertDetails(dbs.staff.db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
