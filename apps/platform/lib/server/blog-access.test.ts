import { beforeEach, describe, expect, it, vi } from "vitest";
import { paidCustomerOrNull } from "./blog-access";
import { BillingRequiredError, requireWebsiteAccess, WebsiteRequiredError } from "./billing";
import type { GrantedCustomer } from "./customer-access";

vi.mock("server-only", () => ({}));
vi.mock("./billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billing")>()),
  requireWebsiteAccess: vi.fn(),
}));

const GRANTED = { tenant: { businessId: "business-1" } } as unknown as GrantedCustomer;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("paidCustomerOrNull", () => {
  it("returns the customer when the business holds the Managed Website service", async () => {
    vi.mocked(requireWebsiteAccess).mockResolvedValue(GRANTED);
    expect(await paidCustomerOrNull()).toBe(GRANTED);
  });

  it("answers null for an unpaid business and for one without a Managed Website line", async () => {
    vi.mocked(requireWebsiteAccess).mockRejectedValueOnce(new BillingRequiredError("business-1"));
    expect(await paidCustomerOrNull()).toBeNull();
    vi.mocked(requireWebsiteAccess).mockRejectedValueOnce(new WebsiteRequiredError("business-1"));
    expect(await paidCustomerOrNull()).toBeNull();
  });

  it("lets a real failure through, so an outage is never reported as unpaid", async () => {
    vi.mocked(requireWebsiteAccess).mockRejectedValue(new Error("database down"));
    await expect(paidCustomerOrNull()).rejects.toThrow("database down");
  });
});
