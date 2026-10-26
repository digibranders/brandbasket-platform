import type { Database, ScopedTransaction } from "@brandbasket/db";
import { findOwnListing, openListingPromotionCharge, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startCustomerChargePayment } from "./charges";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { startListingPromotionPayment } from "./listing-promotion";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  findOwnListing: vi.fn(),
  openListingPromotionCharge: vi.fn(),
  withTenantScope: vi.fn(),
}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const CHARGE_ID = "0192f3c4-2222-7000-8000-000000000002";
const NOW = new Date("2026-10-01T06:30:00.000Z");
const appDb = { name: "app-db" } as unknown as Database;
const staffDb = { name: "staff-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

function customer(): GrantedCustomer {
  return {
    user: { id: "user-1", email: "ana@example.com", name: "Ana Diaz" },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Smile", role: "owner" },
    billing: { hasAccess: true },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(findOwnListing).mockResolvedValue({} as Awaited<ReturnType<typeof findOwnListing>>);
});

describe("startListingPromotionPayment", () => {
  it("opens the charge at ₹299, GST included, for the chosen tag, then the ordinary charge payment", async () => {
    vi.mocked(openListingPromotionCharge).mockResolvedValue({ kind: "opened", chargeId: CHARGE_ID });
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "redirect", url: "/pay" });

    const started = await startListingPromotionPayment(customer(), "hot_new", NOW);

    expect(started).toEqual({ kind: "redirect", url: "/pay" });
    expect(openListingPromotionCharge).toHaveBeenCalledWith(staffDb, {
      businessId: BUSINESS_ID,
      tag: "hot_new",
      description: "Hot & New listing tag, 7 days",
      unitAmountCents: 29_900,
      taxRateBasisPoints: 1_800,
      amountCents: 29_900,
      now: NOW,
    });
    expect(startCustomerChargePayment).toHaveBeenCalledWith(customer(), CHARGE_ID);
  });

  it("opens nothing for a business without a listing", async () => {
    vi.mocked(findOwnListing).mockResolvedValue(null);
    expect(await startListingPromotionPayment(customer(), "hot_new", NOW)).toEqual({ kind: "no-listing" });
    expect(openListingPromotionCharge).not.toHaveBeenCalled();
  });

  it("passes on a refusal without starting a payment", async () => {
    vi.mocked(openListingPromotionCharge).mockResolvedValue({ kind: "refused", reason: "next-week-booked" });
    expect(await startListingPromotionPayment(customer(), "hot_new", NOW)).toEqual({
      kind: "refused",
      reason: "next-week-booked",
    });
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });
});
