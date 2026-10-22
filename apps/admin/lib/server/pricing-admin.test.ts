import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, findActivePlan: vi.fn(), updateExtraPrices: vi.fn() };
});
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

import * as db from "@brandbasket/db";
import { findActivePlan, updateExtraPrices } from "@brandbasket/db";
import { savePriceSheet } from "./pricing-admin";

const INR_PLAN = { currency: "INR", tier: "managed" as const, taxRateBasisPoints: 1800 };
const SHEET = {
  currency: "INR" as const,
  tier: "managed" as const,
  extraHourCents: 142_500,
  extraPublishCents: 30_000,
  extraBlogPostsCents: 47_500,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findActivePlan).mockResolvedValue(INR_PLAN as never);
  vi.mocked(updateExtraPrices).mockResolvedValue([]);
});

describe("savePriceSheet", () => {
  it("sets the extras on the plan the sheet is for, and prices nothing else", async () => {
    vi.mocked(updateExtraPrices).mockResolvedValue(["extra_hour"]);

    const outcome = await savePriceSheet({ sheet: { ...SHEET, extraHourCents: 150_000 }, staffUserId: "staff-1" });

    expect(outcome).toEqual({ kind: "updated", extrasChanged: 1 });
    expect(findActivePlan).toHaveBeenCalledWith({ name: "staff-db" }, "INR", "managed");
    expect(updateExtraPrices).toHaveBeenCalledWith(expect.anything(), {
      currency: "INR",
      prices: { extraHourAmountCents: 150_000, extraPublishAmountCents: 30_000, extraBlogPostsAmountCents: 47_500 },
      staffId: "staff-1",
    });
  });

  it("says so when nothing changed", async () => {
    await expect(savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" })).resolves.toEqual({ kind: "unchanged" });
  });

  it("says so when no plan is on sale in that currency, changing nothing", async () => {
    vi.mocked(findActivePlan).mockResolvedValue(null);

    await expect(savePriceSheet({ sheet: SHEET, staffUserId: "staff-1" })).resolves.toEqual({ kind: "no-plan" });
    expect(updateExtraPrices).not.toHaveBeenCalled();
  });

  it("no longer creates priced plan rows or provider plans: the services are priced in code", () => {
    for (const removed of ["replaceMonthlyPrice", "attachProviderPlan", "planVersionCode", "largestLiveReferralDiscount"]) {
      expect(removed in db).toBe(false);
    }
  });
});
