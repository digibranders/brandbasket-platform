import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadWebsite } from "@/lib/server/website";
import WebsitePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireWebsiteClient: vi.fn() }));
vi.mock("@/lib/server/website", () => ({ loadWebsite: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the Website page", () => {
  it("sends a lapsed customer Home instead of the preview and its buttons", async () => {
    vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant: {}, billing: { status: "lapsed", hasAccess: false } } as never);
    await expect(WebsitePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/");
    expect(loadWebsite).not.toHaveBeenCalled();
  });
});
