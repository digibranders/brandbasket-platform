import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { applyReferralCodeFor } from "@/lib/server/referrals";
import { applyMembershipCode } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn(), LISTING_PAGE_PATH: "/listing" }));
vi.mock("@/lib/server/referrals", () => ({ applyReferralCodeFor: vi.fn(), removeReferralCodeFor: vi.fn() }));
vi.mock("@/lib/server/checkout", () => ({ startMembershipCheckoutFor: vi.fn() }));
vi.mock("@/lib/server/membership", () => ({ continueWithFreeListing: vi.fn() }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn() }));

const CUSTOMER = { tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" } };
const IDLE = { status: "idle" } as const;

function form(code: string): FormData {
  const data = new FormData();
  data.set("referralCode", code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue(CUSTOMER as never);
  vi.mocked(applyReferralCodeFor).mockResolvedValue({ kind: "applied" } as never);
});

describe("applyMembershipCode", () => {
  it("prices the code against the catalogue services of the bound basket, in the catalogue's order", async () => {
    await applyMembershipCode(["local-seo-aeo", "managed-website", "not-a-service"], IDLE, form("SAVE"));

    expect(applyReferralCodeFor).toHaveBeenCalledWith(CUSTOMER, "SAVE", ["managed-website", "local-seo-aeo"], expect.any(Date));
  });

  it.each([
    ["a string", "managed-website"],
    ["an object", { 0: "managed-website" }],
    ["a number", 7],
    ["an array of more than ten", Array.from({ length: 11 }, () => "managed-website")],
    ["an array with a long string", ["x".repeat(41)]],
    ["an array with a non-string", [{ id: "managed-website" }]],
  ])("reads %s as no basket instead of failing", async (_label, bound) => {
    await applyMembershipCode(bound as never, IDLE, form("SAVE"));

    expect(applyReferralCodeFor).toHaveBeenCalledWith(CUSTOMER, "SAVE", [], expect.any(Date));
  });
});
