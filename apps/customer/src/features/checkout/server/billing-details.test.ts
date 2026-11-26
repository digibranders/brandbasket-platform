import { findBillingProfile, findBusinessCurrency, findBusinessEntry, findInvoiceFallbackRecipient, getBusinessProfile } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { billingDetailsMissing, loadBillingDetailsView } from "./billing-details";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@brandbasket/shared/server/phone-defaults", () => ({ savedPhoneStart: () => ({ country: null, number: "" }) }));
vi.mock("@brandbasket/db", () => ({
  findBillingProfile: vi.fn(),
  findBusinessCurrency: vi.fn(),
  findBusinessEntry: vi.fn(),
  findInvoiceFallbackRecipient: vi.fn(),
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
  vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
  vi.mocked(findInvoiceFallbackRecipient).mockResolvedValue({ name: "Riverside", addressLines: [], region: null, postalCode: null, registeredStateCode: "mh" });
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

describe("billingDetailsMissing", () => {
  it("is true for a business billed in rupees with nothing saved", async () => {
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
  });

  it("is false once details are saved, without reading anything else", async () => {
    vi.mocked(findBillingProfile).mockResolvedValue({ legalName: "Riverside" } as never);
    expect(await billingDetailsMissing(customer("INR"))).toBe(false);
    expect(findBusinessEntry).not.toHaveBeenCalled();
    expect(findInvoiceFallbackRecipient).not.toHaveBeenCalled();
  });

  it("is false for a paid sign-up that gave its state and saved nothing: its invoice is made out to the business name and state", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
    expect(await billingDetailsMissing(customer("INR"))).toBe(false);
  });

  it("is true for a paid sign-up with no state, and for a website client invited by staff whose state is known", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
    vi.mocked(findInvoiceFallbackRecipient).mockResolvedValue({ name: "Riverside", addressLines: [], region: null, postalCode: null, registeredStateCode: null });
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
    vi.mocked(findInvoiceFallbackRecipient).mockResolvedValue({ name: "Riverside", addressLines: [], region: null, postalCode: null, registeredStateCode: "mh" });
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
  });

  it("is true for a paid sign-up whose name or onboarding address an invoice cannot print", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
    vi.mocked(findInvoiceFallbackRecipient).mockResolvedValue({ name: "शाह मिठाई", addressLines: [], region: null, postalCode: null, registeredStateCode: "mh" });
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
    vi.mocked(findInvoiceFallbackRecipient).mockResolvedValue({ name: "Riverside", addressLines: ["१२ बाज़ार रोड"], region: null, postalCode: null, registeredStateCode: "mh" });
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
  });

  it("treats a business whose entry cannot be read as a client, so it is asked", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue(null);
    expect(await billingDetailsMissing(customer("INR"))).toBe(true);
  });

  it("is false for a business billed in dollars, which gets no tax invoice, without reading any details", async () => {
    expect(await billingDetailsMissing(customer("USD"))).toBe(false);
    expect(findBillingProfile).not.toHaveBeenCalled();
  });
});
