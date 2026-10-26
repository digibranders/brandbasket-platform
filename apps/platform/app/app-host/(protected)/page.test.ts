import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { loadOverview } from "@/lib/server/overview";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadFirstLook } from "@/lib/server/first-look";
import { loadTodo } from "@/lib/server/todo";
import AppHomePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ isPhoneAccountEmail: vi.fn(() => false) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/billing-banner", () => ({ getBillingBanner: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("@/lib/server/overview", () => ({ loadOverview: vi.fn() }));
vi.mock("@/lib/server/setup-call", () => ({ getSetupCallState: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadFirstLook: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const banner = { kind: "pay", title: "Start your plan", price: null, action: { href: "/onboarding/review", label: "Check and send" } };

async function renderHome(): Promise<string> {
  return renderToStaticMarkup(await AppHomePage()).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha Rao", email: "asha@example.com" }, tenant, billing: { hasAccess: false } } as never);
  vi.mocked(getBillingBanner).mockResolvedValue(banner as never);
  vi.mocked(getProjectOverview).mockResolvedValue({ project: { status: "onboarding", slaDueAt: null, onboardingSubmittedAt: null, previewSentAt: null }, completed: ["business"] } as never);
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
  vi.mocked(getSetupCallState).mockResolvedValue({ url: null, booking: null, readAtMs: Date.parse("2026-10-27T10:00:00Z") });
});

describe("the home page of an account with no access", () => {
  it("shows the payment banner and the setup steps, and reads neither the Overview nor the To do", async () => {
    const html = await renderHome();

    expect(html).toContain("Hello, Asha.");
    expect(html).toContain("Start your plan");
    expect(html).toContain("Get ready for your call");
    expect(html).not.toContain("Needs you");
    expect(html).not.toContain("Everything is running");
    expect(html).not.toContain("Next payment");
    expect(loadOverview).not.toHaveBeenCalled();
    expect(loadTodo).not.toHaveBeenCalled();
    expect(loadFirstLook).not.toHaveBeenCalled();
  });

  it("shows where the website stands for a lapsed account whose site is live", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "cafe.example", launchedAt: new Date("2026-09-01T00:00:00Z") } as never);

    const html = await renderHome();

    expect(html).toContain("Your website is live");
    expect(html).toContain("cafe.example");
    expect(loadOverview).not.toHaveBeenCalled();
  });
});
