import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/server/billing", () => ({
  BillingRequiredError: class BillingRequiredError extends Error {},
  requireBillingAccess: vi.fn(),
}));
vi.mock("@/lib/server/checkout", () => ({ startCheckoutFor: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/server/onboarding", () => ({ submitOnboardingFor: vi.fn() }));
vi.mock("@/lib/server/referrals", () => ({ applyReferralCodeFor: vi.fn(), removeReferralCodeFor: vi.fn() }));

import { BillingRequiredError, requireBillingAccess } from "@/lib/server/billing";
import { submitOnboardingFor } from "@/lib/server/onboarding";
import { submitOnboarding } from "./actions";

const TENANT = { userId: "user-1", businessId: "biz-1", businessName: "Lotus Studio", role: "owner" } as const;

function granted(hasWebsite: boolean): Awaited<ReturnType<typeof requireBillingAccess>> {
  return { tenant: TENANT, billing: { hasAccess: true, hasWebsite } } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("submitOnboarding", () => {
  it("sends a paid client with the Managed Website service to its project", async () => {
    vi.mocked(requireBillingAccess).mockResolvedValue(granted(true));
    vi.mocked(submitOnboardingFor).mockResolvedValue(null);

    await expect(submitOnboarding({ status: "idle" }, new FormData())).rejects.toThrow("redirect:/project");
    expect(submitOnboardingFor).toHaveBeenCalledOnce();
  });

  it("sends a paid Social-only client Home and sends nothing", async () => {
    vi.mocked(requireBillingAccess).mockResolvedValue(granted(false));

    await expect(submitOnboarding({ status: "idle" }, new FormData())).rejects.toThrow("redirect:/");
    expect(submitOnboardingFor).not.toHaveBeenCalled();
  });

  it("still refuses an unpaid client with the payment message", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new BillingRequiredError("biz-1"));

    const state = await submitOnboarding({ status: "idle" }, new FormData());
    expect(state).toMatchObject({ status: "error" });
    expect(submitOnboardingFor).not.toHaveBeenCalled();
  });
});
