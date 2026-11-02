import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import AskForAChangePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadSetupServices: vi.fn() }));
vi.mock("@/lib/server/requests", () => ({ loadRequests: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the new request page", () => {
  it.each(["unpaid", "lapsed"] as const)("sends a %s customer Home before reading anything", async (status) => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: {}, billing: { status, hasAccess: false } } as never);
    await expect(AskForAChangePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/");
    expect(loadSetupServices).not.toHaveBeenCalled();
  });
});
