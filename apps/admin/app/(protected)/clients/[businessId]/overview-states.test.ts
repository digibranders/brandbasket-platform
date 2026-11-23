import {
  findClientIntake,
  findOpenClosureForBusiness,
  findSetupCallBooking,
  listActivityForBusiness,
  listAddOnsToContact,
  listAssignableSupportStaff,
  listLiveServiceLines,
  listOpenPrivacyRequests,
  listPaymentsNeedingAttention,
} from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openClientTab } from "@/lib/server/client-page";
import ClientOverviewPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/components/activity-list", () => ({ ActivityList: () => "[activity list]" }));
vi.mock("./parts", () => ({ BillingFacts: () => "[billing facts]", Facts: () => "[facts]", When: () => "[when]" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findClientIntake: vi.fn(),
    findSetupCallBooking: vi.fn(),
    listActivityForBusiness: vi.fn(),
    listAssignableSupportStaff: vi.fn(),
    findOpenClosureForBusiness: vi.fn(),
    listOpenPrivacyRequests: vi.fn(),
    listPaymentsNeedingAttention: vi.fn(),
    listLiveServiceLines: vi.fn(),
    listAddOnsToContact: vi.fn(),
  };
});

const billing = (status: string): unknown => ({
  subscription: { status, paidThroughAt: new Date(Date.now() + 30 * 86_400_000), activatedAt: new Date("2026-10-01T00:00:00Z") },
  firstPayment: { amountCents: 1, currency: "INR", paidAt: new Date(), manual: null },
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function client(overrides: Record<string, unknown> = {}): never {
  return {
    businessId: BUSINESS,
    businessName: "Harbour Bakery",
    owner: { userId: "u-owner", name: "Asha", email: null, phone: null },
    currency: "INR",
    createdAt: new Date("2026-10-20T06:30:00Z"),
    completedSteps: [],
    billing: billing("active"),
    movingTo: null,
    domain: null,
    project: { id: "p1", status: "preview", onboardingSubmittedAt: null, slaDueAt: null, previewUrl: null, previewSentAt: new Date(), revisionRoundsGranted: 1, launchedAt: null, createdAt: new Date() },
    ...overrides,
  } as never;
}

async function render(overrides: Record<string, unknown> = {}): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role: "admin" } }, client: client(overrides) } as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return renderToStaticMarkup(await ClientOverviewPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(findClientIntake).mockResolvedValue(null);
  vi.mocked(listActivityForBusiness).mockResolvedValue([]);
  vi.mocked(listAssignableSupportStaff).mockResolvedValue([]);
  vi.mocked(findOpenClosureForBusiness).mockResolvedValue(null);
  vi.mocked(listOpenPrivacyRequests).mockResolvedValue([]);
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listLiveServiceLines).mockResolvedValue([]);
  vi.mocked(listAddOnsToContact).mockResolvedValue([]);
});

describe("the Overview when every read worked", () => {
  it("says nothing is waiting, and what was checked", async () => {
    const html = await render();
    expect(html).toContain("Nothing is waiting on us.");
    expect(html).not.toContain("Needs a look");
  });
});

describe("the Overview when a read failed", () => {
  it("does not say nothing is waiting, and offers Try again", async () => {
    vi.mocked(findOpenClosureForBusiness).mockRejectedValue(new Error("db down"));
    const html = await render();
    expect(html).not.toContain("Nothing is waiting on us.");
    expect(html).toContain("We could not check what is waiting");
    expect(html).toContain("Could not read the closing state.");
    expect(html).toContain("Try again");
  });

  it("keeps the page: a failed history read blanks only its own panel", async () => {
    vi.mocked(listActivityForBusiness).mockRejectedValue(new Error("db down"));
    const html = await render();
    expect(html).toContain("We could not load the history");
    expect(html).toContain("What the customer sees");
  });

  it("shows a known exception first even when another read failed", async () => {
    vi.mocked(listOpenPrivacyRequests).mockRejectedValue(new Error("db down"));
    const html = await render({ billing: billing("past_due") });
    expect(html).toContain("Check the failed renewal");
    expect(html).toContain("Could not read privacy requests.");
  });
});

describe("the Overview's exceptions", () => {
  it("leads with a failed renewal, then lists the kickoff call nobody confirmed", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ heldAt: null, startsAt: new Date(Date.now() - 90_000_000), endsAt: new Date(Date.now() - 86_400_000) } as never);
    const html = await render({
      billing: billing("past_due"),
      project: { id: "p1", status: "onboarding", onboardingSubmittedAt: null, slaDueAt: null, previewUrl: null, previewSentAt: null, revisionRoundsGranted: 1, launchedAt: null, createdAt: new Date() },
    });
    expect(html).toContain("2 things need a look");
    expect(html.indexOf("The monthly renewal failed")).toBeLessThan(html.indexOf("The kickoff call ended"));
    expect(html).toContain(">Check the failed renewal<");
  });

  it("shows an open privacy request that came from the owner's account, and no one else's", async () => {
    const request = (subjectUserId: string): never => ({ subjectUserId, dueAt: new Date(Date.now() + 17 * 86_400_000) }) as never;
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([request("someone-else")]);
    expect(await render()).not.toContain("A privacy request is open");
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([request("u-owner")]);
    expect(await render()).toContain("A privacy request is open");
  });

  it("names a paid service nobody has set up yet", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue([{ businessId: BUSINESS, addOn: "paid-ads", netAmountCents: 1, status: "active" }]);
    vi.mocked(listAddOnsToContact).mockResolvedValue([{ kind: "bundled", id: "a1", businessId: BUSINESS, businessName: "x", addOn: "paid-ads", at: new Date() }]);
    const html = await render({ project: null });
    expect(html).toContain("Set up Paid Ads Management");
    expect(html).toContain(`href="/clients/${BUSINESS}/billing#add-ons"`);
  });
});
