import { findBillingProfile, findBusinessCurrency, getBusinessProfile } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBillingDetailsView } from "./billing-details";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@brandbasket/shared/server/phone-defaults", () => ({ savedPhoneStart: () => ({ country: null, number: "" }) }));
vi.mock("@brandbasket/db", () => ({
  findBillingProfile: vi.fn(),
  findBusinessCurrency: vi.fn(),
  getBusinessProfile: vi.fn(),
  withTenantScope: vi.fn((_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ name: "app-tx" })),
}));

const TENANT = {
  userId: "user-1",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Riverside",
  role: "owner",
} as const;

/** A customer as the pages hand it over: `plan` is null for a free listing account. */
function customer(planCurrency: "INR" | "USD" | null): Parameters<typeof loadBillingDetailsView>[0] {
  return { tenant: TENANT, billing: { plan: planCurrency === null ? null : { currency: planCurrency } } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findBillingProfile).mockResolvedValue(null);
  vi.mocked(getBusinessProfile).mockResolvedValue(null);
});

describe("loadBillingDetailsView", () => {
  it("gives a client on an INR plan the card, without reading the business's currency", async () => {
    const view = await loadBillingDetailsView(customer("INR"));
    expect(view?.saved).toBeNull();
    expect(view?.start.legalName).toBe("Riverside");
    expect(view?.businessName).toBe("Riverside");
    expect(findBusinessCurrency).not.toHaveBeenCalled();
  });

  it("gives a listing account with no plan, billed in rupees, the card", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue("INR");
    expect(await loadBillingDetailsView(customer(null))).not.toBeNull();
    expect(findBusinessCurrency).toHaveBeenCalledWith({ name: "app-tx" }, TENANT.businessId);
  });

  it("gives nothing to a listing account with no plan that is billed in dollars", async () => {
    vi.mocked(findBusinessCurrency).mockResolvedValue("USD");
    expect(await loadBillingDetailsView(customer(null))).toBeNull();
    expect(findBillingProfile).not.toHaveBeenCalled();
  });

  it("gives nothing to a client on a dollar plan", async () => {
    expect(await loadBillingDetailsView(customer("USD"))).toBeNull();
  });
});
