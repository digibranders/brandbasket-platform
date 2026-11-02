import { beforeEach, describe, expect, it, vi } from "vitest";
import LegacyActivityPage from "./activity/page";
import LegacyProjectPage from "./project/page";
import LegacyServicesPage from "./services/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

type Page = typeof LegacyProjectPage;

async function landing(page: Page, query: Record<string, string | string[] | undefined> = {}): Promise<string> {
  try {
    await page({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(query) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("redirect:")) return error.message.slice("redirect:".length);
    throw error;
  }
  throw new Error("The page did not redirect.");
}

beforeEach(() => vi.clearAllMocks());

describe("the old client tab addresses", () => {
  it("/project goes to the Website tab", async () => {
    expect(await landing(LegacyProjectPage)).toBe(`/clients/${BUSINESS}/website`);
  });

  it("/services goes to Plan and billing", async () => {
    expect(await landing(LegacyServicesPage)).toBe(`/clients/${BUSINESS}/billing`);
  });

  it("/activity goes to the Activity fold on Messages", async () => {
    expect(await landing(LegacyActivityPage)).toBe(`/clients/${BUSINESS}/requests#activity`);
  });

  it("keep the whole query string, so a notice survives the move", async () => {
    expect(await landing(LegacyProjectPage, { move: "cancelled" })).toBe(`/clients/${BUSINESS}/website?move=cancelled`);
    expect(await landing(LegacyProjectPage, { build: "paused", preview: "sent" })).toBe(`/clients/${BUSINESS}/website?build=paused&preview=sent`);
    expect(await landing(LegacyServicesPage, { addOns: "contacted", work: ["a", "b"] })).toBe(`/clients/${BUSINESS}/billing?addOns=contacted&work=a&work=b`);
    expect(await landing(LegacyActivityPage, { q: "x" })).toBe(`/clients/${BUSINESS}/requests?q=x#activity`);
  });
});
