import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, planTierForSignupChoice } from "./billing";
import { openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "../testing";

let databases: TestDatabases;

beforeAll(() => {
  databases = openTestDatabases();
});

beforeEach(async () => {
  await resetTestDatabase(databases.owner);
  await seedPlansFromMigrations(databases.owner);
});

afterAll(async () => {
  await databases.closeAll();
});

describe("the Managed Website plan", () => {
  it("is the only plan, and the only one on sale", async () => {
    const rows = await querySql<{ code: string; tier: string; active: boolean }>(databases.owner, "select code, tier, active from plans");
    expect(rows).toEqual([{ code: "managed-inr-2026-10", tier: "managed", active: true }]);
  });

  it("costs ₹3,000 a month before 18% GST, the first payment covering one month, with ₹500 extra hours", async () => {
    expect(await findActivePlan(databases.staff.db, "INR", "managed")).toMatchObject({
      name: "Managed Website",
      tier: "managed",
      initialAmountCents: 300_000,
      initialTermMonths: 1,
      recurringAmountCents: 300_000,
      taxRateBasisPoints: 1800,
      includedChangeHours: 1,
      extraHourAmountCents: 50_000,
      includedPublishesPerMonth: 3,
      extraPublishAmountCents: 30_000,
      providerPlanId: null,
    });
  });

  it("has no dollar price until the owner sets one", async () => {
    expect(await findActivePlan(databases.staff.db, "USD", "managed")).toBeNull();
  });

  it("is what every sign-up choice buys", () => {
    for (const choice of [null, "own_website", "listing_only", "managed"] as const) expect(planTierForSignupChoice(choice)).toBe("managed");
  });
});
