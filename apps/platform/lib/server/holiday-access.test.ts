import { beforeEach, describe, expect, it, vi } from "vitest";
import { paidCustomerOrNull } from "./blog-access";
import { getCustomerBusinessKind, requireCustomerAccess, type GrantedCustomer } from "./customer-access";
import { getCustomerTenant } from "./customer-tenant";
import { holidayAccessOrNull } from "./holiday-access";

vi.mock("server-only", () => ({}));
vi.mock("./blog-access", () => ({ paidCustomerOrNull: vi.fn() }));
vi.mock("./customer-access", () => ({ getCustomerBusinessKind: vi.fn(), requireCustomerAccess: vi.fn() }));
vi.mock("./customer-tenant", () => ({ getCustomerTenant: vi.fn() }));

const TENANT = { userId: "user-1", businessId: "business-1", businessName: "Smile Dental", role: "owner" } as const;
const GRANTED = { tenant: TENANT } as unknown as GrantedCustomer;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCustomerTenant).mockResolvedValue(TENANT);
});

describe("holidayAccessOrNull", () => {
  it("lets a free listing account through without a payment", async () => {
    vi.mocked(getCustomerBusinessKind).mockResolvedValue("listing");
    vi.mocked(requireCustomerAccess).mockResolvedValue(GRANTED);
    expect(await holidayAccessOrNull()).toBe(GRANTED);
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow", plan: "premium" });
    expect(paidCustomerOrNull).not.toHaveBeenCalled();
  });

  it("asks a website client to have paid, and answers null for one that has not", async () => {
    vi.mocked(getCustomerBusinessKind).mockResolvedValue("website");
    vi.mocked(paidCustomerOrNull).mockResolvedValueOnce(GRANTED).mockResolvedValueOnce(null);
    expect(await holidayAccessOrNull()).toBe(GRANTED);
    expect(await holidayAccessOrNull()).toBeNull();
    expect(requireCustomerAccess).not.toHaveBeenCalled();
  });

  it("sends a visitor with no session to sign in", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue(null);
    vi.mocked(requireCustomerAccess).mockResolvedValue(GRANTED);
    expect(await holidayAccessOrNull()).toBe(GRANTED);
    expect(requireCustomerAccess).toHaveBeenCalledWith();
  });
});
