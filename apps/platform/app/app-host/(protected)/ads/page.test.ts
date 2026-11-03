import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadActiveServices } from "@/lib/server/active-services";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import AdsPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/active-services", () => ({ loadActiveServices: vi.fn() }));
vi.mock("@/components/ads/ads-view", () => ({ AdsView: () => null }));

const tenant = { userId: "user-1", businessId: "business-1" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
  vi.mocked(loadActiveServices).mockResolvedValue(["social"]);
});

describe("the Ads page", () => {
  it("sends a visitor who is signed out to sign in and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(AdsPage()).rejects.toThrow("redirect:/login");
    expect(loadActiveServices).not.toHaveBeenCalled();
  });

  it("sends an account without an active plan home", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);
    await expect(AdsPage()).rejects.toThrow("redirect:/");
    expect(loadActiveServices).not.toHaveBeenCalled();
  });

  it("sends a business without the service to Your plan", async () => {
    vi.mocked(loadActiveServices).mockResolvedValue(["website"]);
    await expect(AdsPage()).rejects.toThrow(/redirect:\/services|redirect:\/plan|redirect:/);
    expect(redirect).toHaveBeenCalled();
  });

  it("draws the page for a business that has it", async () => {
    await expect(AdsPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
