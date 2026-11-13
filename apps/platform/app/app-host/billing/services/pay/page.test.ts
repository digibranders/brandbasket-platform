import { findWaitingAddedServiceSuccessor, withTenantScope } from "@brandbasket/db";
import { combinedStillFits } from "@brandbasket/shared/server/added-service";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBillingProvider } from "@/lib/server/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import AddedServicePayPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findWaitingAddedServiceSuccessor: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("@brandbasket/shared/server/added-service", () => ({ combinedStillFits: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/components/panel/razorpay-checkout-screen", () => ({ RazorpayCheckoutScreen: () => null }));
vi.mock("@/lib/brand", () => ({ logoOf: vi.fn(() => "logo") }));
vi.mock("@/lib/server/billing", () => ({ getBillingProvider: vi.fn(), razorpayKeyId: vi.fn(() => "rzp_test_key") }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ name: "app-db" })) }));
vi.mock("@/lib/server/request-brand", () => ({ requestAppOrigin: vi.fn(async () => "https://app.brandbasket.in"), requestBrand: vi.fn(async () => ({})) }));

const TENANT = { userId: "user-1", businessId: "business-1" };
const WAITING = { id: "sub-2", businessId: "business-1", provider: "razorpay", providerSubscriptionId: "rzp-sub-2" };

function customer(overrides: Record<string, unknown> = {}): never {
  return { tenant: TENANT, user: { email: "ana@example.com", phone: null }, billing: { subscription: { id: "sub-1" } }, ...overrides } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBillingProvider).mockReturnValue({ name: "razorpay" } as never);
  vi.mocked(requireCustomerAccess).mockResolvedValue(customer());
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ name: "tx" } as never));
  vi.mocked(findWaitingAddedServiceSuccessor).mockResolvedValue(WAITING as never);
  vi.mocked(combinedStillFits).mockResolvedValue({} as never);
});

describe("the page that opens the combined subscription for payment", () => {
  it("opens Razorpay on the waiting subscription, with the plan callback marked to return to Billing and a way back to Your services", async () => {
    const page = (await AddedServicePayPage()) as ReactElement<{ target: unknown; callbackUrl: string; dismissHref: string; keyId: string; email: string }>;

    expect(isValidElement(page)).toBe(true);
    expect(page.props.target).toEqual({ kind: "subscription", subscriptionId: "rzp-sub-2" });
    expect(page.props.callbackUrl).toBe("https://app.brandbasket.in/billing/pay/callback?return=services");
    expect(page.props.dismissHref).toBe("/services");
    expect(page.props.keyId).toBe("rzp_test_key");
    expect(page.props.email).toBe("ana@example.com");
  });

  it("reads the subscription from the database for the signed-in business, as the one continuing its current subscription", async () => {
    await AddedServicePayPage();
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, TENANT, expect.any(Function));
    expect(findWaitingAddedServiceSuccessor).toHaveBeenCalledWith({ name: "tx" }, "sub-1");
  });

  it("is a 404 for any provider but Razorpay, before it reads anything", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({ name: "fake" } as never);
    await expect(AddedServicePayPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireCustomerAccess).not.toHaveBeenCalled();
  });

  it("goes back to Your services with no subscription", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue(customer({ billing: { subscription: null } }));
    await expect(AddedServicePayPage()).rejects.toThrow("NEXT_REDIRECT /services");
  });

  it("goes back to Your services with nothing waiting", async () => {
    vi.mocked(findWaitingAddedServiceSuccessor).mockResolvedValue(null);
    await expect(AddedServicePayPage()).rejects.toThrow("NEXT_REDIRECT /services");
  });

  it("goes back when what waits no longer fits the plan", async () => {
    vi.mocked(combinedStillFits).mockResolvedValue(null);
    await expect(AddedServicePayPage()).rejects.toThrow("NEXT_REDIRECT /services");
  });

  it.each([{ businessId: "another-business" }, { provider: "fake" }])("never opens one that is not this business's Razorpay subscription (%o)", async (override) => {
    vi.mocked(findWaitingAddedServiceSuccessor).mockResolvedValue({ ...WAITING, ...override } as never);
    await expect(AddedServicePayPage()).rejects.toThrow("NEXT_REDIRECT /services");
    expect(combinedStillFits).not.toHaveBeenCalled();
  });

  it("asks for the phone instead of the email when the customer has one", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue(customer({ user: { email: "ana@example.com", phone: "+919876543210" } }));
    const page = (await AddedServicePayPage()) as ReactElement<{ email: string | null; contact: string | null }>;
    expect(page.props.email).toBeNull();
    expect(page.props.contact).toBe("+919876543210");
  });
});
