import { clearPriceOverride, findBillingState, listPriceOverridesForBusiness } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffCan } from "@/lib/server/staff-role";
import type { GrantedStaff } from "@/lib/server/staff-access";
import { clearPriceOverrideAction } from "./override-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@brandbasket/db", async () => ({
  ...(await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")),
  clearPriceOverride: vi.fn(),
  findBillingState: vi.fn(),
  listPriceOverridesForBusiness: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";
const STAFF = { user: { id: "staff-1" } } as unknown as GrantedStaff;
const HELD = { addOn: "social-media", billingInterval: "month", netCents: 199_900 };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}
const GOOD = { businessId: BUSINESS, addOn: "social-media", billingInterval: "month" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffCan).mockResolvedValue(STAFF);
  vi.mocked(findBillingState).mockResolvedValue({ currency: "INR" } as never);
  vi.mocked(listPriceOverridesForBusiness).mockResolvedValue([HELD] as never);
  vi.mocked(clearPriceOverride).mockResolvedValue(true);
});

describe("clearPriceOverrideAction", () => {
  it("needs the money capability, removes the one agreed price and records it", async () => {
    await expect(clearPriceOverrideAction(form(GOOD))).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing`);
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(clearPriceOverride).toHaveBeenCalledWith({ name: "staff-db" }, { businessId: BUSINESS, addOn: "social-media", billingInterval: "month" });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: BUSINESS, kind: "price_override.cleared", summary: expect.stringContaining("₹1,999 a month") }));
  });

  it("changes and records nothing for a price that is not held (another period) or a form that is not ours", async () => {
    await clearPriceOverrideAction(form({ ...GOOD, billingInterval: "year" })).catch(() => undefined);
    await clearPriceOverrideAction(form({ ...GOOD, addOn: "nonsense" }));
    await clearPriceOverrideAction(form({ ...GOOD, businessId: "not-an-id" }));
    expect(clearPriceOverride).not.toHaveBeenCalled();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });

  it("is refused for a role without the money capability", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(new Error("forbidden"));
    await expect(clearPriceOverrideAction(form(GOOD))).rejects.toThrow("forbidden");
    expect(clearPriceOverride).not.toHaveBeenCalled();
  });
});
