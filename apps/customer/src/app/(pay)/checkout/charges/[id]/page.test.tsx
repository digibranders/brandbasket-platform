import { beforeEach, describe, expect, it, vi } from "vitest";
import ChargePayPage from "./page";

const mocks = vi.hoisted(() => ({
  providerName: vi.fn<() => string>(),
  start: vi.fn(),
  customer: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/features/checkout/server/billing", () => ({
  getBillingProvider: () => ({ name: mocks.providerName() }),
  isFakeBillingProvider: () => mocks.providerName() === "fake",
  razorpayKeyId: () => "rzp_test",
}));
vi.mock("@/features/checkout/server/charges", () => ({ startCustomerChargePayment: mocks.start, loadTicketIdOfChangeCharge: vi.fn() }));
vi.mock("@/features/checkout/components/razorpay-checkout", () => ({ RazorpayCheckout: () => null }));
vi.mock("@/lib/guards", () => ({ requireCustomer: mocks.customer }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "http://localhost:3197" }) }));
vi.mock("@brandbasket/db", () => ({ findChargeForBusiness: vi.fn(), withTenantScope: vi.fn(async () => null) }));

const CHARGE = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const open = (id: string) => ChargePayPage({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customer.mockResolvedValue({ role: "owner", tenant: { businessId: "b1" }, user: { email: "a@b.test", phone: null } });
});

describe("the charge pay page", () => {
  it("opens the fake provider's test page instead of a 404 (local and staging)", async () => {
    mocks.providerName.mockReturnValue("fake");
    mocks.start.mockResolvedValue({ kind: "redirect", url: "/billing/charges/confirm?token=t" });
    await expect(open(CHARGE)).rejects.toThrow("redirect:/billing/charges/confirm?token=t");
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ role: "owner" }), CHARGE);
  });

  it("says a paid charge is already paid", async () => {
    mocks.providerName.mockReturnValue("fake");
    mocks.start.mockResolvedValue({ kind: "not-open" });
    await expect(open(CHARGE)).rejects.toThrow(/^redirect:/);
  });

  it("opens nothing for a viewer or a malformed id", async () => {
    mocks.providerName.mockReturnValue("fake");
    mocks.customer.mockResolvedValue({ role: "viewer", tenant: { businessId: "b1" }, user: { email: "a@b.test", phone: null } });
    await expect(open(CHARGE)).rejects.toThrow("not-found");
    await expect(open("nope")).rejects.toThrow("not-found");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("with Razorpay, still only reads the stored order and opens nothing itself", async () => {
    mocks.providerName.mockReturnValue("razorpay");
    await expect(open(CHARGE)).rejects.toThrow("not-found");
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
