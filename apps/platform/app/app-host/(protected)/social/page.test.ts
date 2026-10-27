import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSocial } from "@/lib/server/social";
import SocialPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/social", () => ({ loadSocial: vi.fn() }));
vi.mock("@/components/social/social-view", () => ({ SocialView: () => null }));

const tenant = { userId: "user-1", businessId: "business-1" };
const data = { posts: [], monthLine: null, ads: null, report: null, month: "November" };
const none = Promise.resolve({});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSocial).mockResolvedValue(data);
});

describe("the Social & Ads page", () => {
  it("sends a signed-out visitor to sign in and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("redirect:/login"));

    await expect(SocialPage({ searchParams: none })).rejects.toThrow("redirect:/login");
    expect(loadSocial).not.toHaveBeenCalled();
  });

  it("sends an account with no access home and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);

    await expect(SocialPage({ searchParams: none })).rejects.toThrow("redirect:/");
    expect(loadSocial).not.toHaveBeenCalled();
  });

  it("sends a business that has not bought Social & Ads to Your plan", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
    vi.mocked(loadSocial).mockResolvedValue(null);

    await expect(SocialPage({ searchParams: none })).rejects.toThrow("redirect:/services");
  });

  it("draws the page for a business that bought it, with the notice the address carries", async () => {
    const billing = { hasAccess: true };
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing } as never);

    const element = await SocialPage({ searchParams: Promise.resolve({ notice: "approved" }) });
    expect(loadSocial).toHaveBeenCalledWith(tenant, billing, expect.any(Date));
    expect(element.props).toMatchObject({ data, notice: { ok: true } });

    const plain = await SocialPage({ searchParams: Promise.resolve({ notice: "whatever" }) });
    expect(plain.props).toMatchObject({ notice: null });
  });
});
