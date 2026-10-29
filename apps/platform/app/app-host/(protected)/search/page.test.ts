import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSearch } from "@/lib/server/search";
import SearchPage, { metadata } from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/search", () => ({ loadSearch: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn(async () => ({ services: [], items: [], open: 0, answers: { social: undefined, search: undefined } })) }));
vi.mock("@/components/search/search-view", () => ({ SearchView: () => null }));

const tenant = { userId: "user-1", businessId: "business-1" };
const data = { summary: { pageOne: null, pages: [], listings: [] }, report: null, month: "November" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the Search page", () => {
  it("is titled Local SEO + AEO, never just Search, which is the sidebar search box", () => {
    expect(metadata).toEqual({ title: "Local SEO + AEO" });
  });

  it("sends a signed-out visitor on to sign in, reading nothing", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("redirect:/login"));

    await expect(SearchPage()).rejects.toThrow("redirect:/login");
    expect(loadSearch).not.toHaveBeenCalled();
  });

  it("sends an account with no access home and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);

    await expect(SearchPage()).rejects.toThrow("redirect:/");
    expect(loadSearch).not.toHaveBeenCalled();
  });

  it("sends a business that has not bought Search to Your plan", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
    vi.mocked(loadSearch).mockResolvedValue(null);

    await expect(SearchPage()).rejects.toThrow("redirect:/services");
  });

  it("opens for a business that bought Search", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
    vi.mocked(loadSearch).mockResolvedValue(data);

    await expect(SearchPage()).resolves.toBeDefined();
    expect(loadSearch).toHaveBeenCalledWith(tenant, expect.any(Date));
  });
});
