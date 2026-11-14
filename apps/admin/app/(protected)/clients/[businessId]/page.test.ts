import { findClientIntake, findSetupCallBooking, listActivityForBusiness, listAssignableSupportStaff, type ProjectStatus } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEXT_STEP_HEADLINES } from "@/lib/delivery-tab";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { openClientTab } from "@/lib/server/client-page";
import ClientOverviewPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/lib/server/add-ons-admin", () => ({ loadClientAddOns: vi.fn() }));
vi.mock("@/components/activity-list", () => ({ ActivityList: () => "[activity list]" }));
vi.mock("./parts", () => ({ BillingFacts: () => "[billing facts]", Facts: () => "[facts]", When: () => "[when]" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, findClientIntake: vi.fn(), findSetupCallBooking: vi.fn(), listActivityForBusiness: vi.fn(), listAssignableSupportStaff: vi.fn() };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function client(status: ProjectStatus | null, movingTo: { hostname: string } | null = null): never {
  return {
    businessId: BUSINESS,
    businessName: "Harbour Bakery",
    owner: null,
    currency: "INR",
    createdAt: new Date("2026-10-20T06:30:00Z"),
    completedSteps: [],
    billing: { subscription: null, firstPayment: null },
    movingTo,
    project:
      status === null
        ? null
        : { id: "p1", status, onboardingSubmittedAt: null, slaDueAt: null, previewUrl: null, previewSentAt: null, revisionRoundsGranted: 1, launchedAt: null, createdAt: new Date("2026-10-20T06:30:00Z") },
  } as never;
}

async function render(status: ProjectStatus | null, role: "support" | "finance" = "support", movingTo: { hostname: string } | null = null): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role } }, client: client(status, movingTo) } as never);
  return renderToStaticMarkup(await ClientOverviewPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(findClientIntake).mockResolvedValue(null);
  vi.mocked(listActivityForBusiness).mockResolvedValue([]);
  vi.mocked(listAssignableSupportStaff).mockResolvedValue([]);
  vi.mocked(loadClientAddOns).mockResolvedValue({ package: {} } as never);
});

describe("the Overview's next step", () => {
  it("says what the Website tab's next-step card says, and links to the Website tab", async () => {
    for (const status of ["submitted", "building", "revisions"] as const) {
      const html = await render(status);
      expect(html, status).toContain(`>${NEXT_STEP_HEADLINES[status].replace("'", "&#x27;")}<`);
      expect(html, status).toContain(`href="/clients/${BUSINESS}/website"`);
      expect(html, status).toContain(">Open website<");
    }
  });

  it("opens going live at the domain section of the Website tab", async () => {
    const html = await render("approved");
    expect(html).toContain(`>${NEXT_STEP_HEADLINES.approved}<`);
    expect(html).toContain(`href="/clients/${BUSINESS}/website#domain"`);
  });

  it("puts a domain move first, at the same section", async () => {
    const html = await render("building", "support", { hostname: "harbour.in" });
    expect(html).toContain("Move them to their own domain");
    expect(html).toContain(`href="/clients/${BUSINESS}/website#domain"`);
  });

  it("is quiet when nothing waits on us", async () => {
    expect(await render("preview")).toContain("Nothing is waiting on us.");
  });

  it("links All activity to the Activity fold on Messages", async () => {
    expect(await render("building")).toContain(`href="/clients/${BUSINESS}/requests#activity"`);
  });

  it("renders the mirror panel showing what the customer sees", async () => {
    const html = await render("building");
    expect(html).toContain("What the customer sees");
    expect(html).toContain("We are building your website");
  });
});

describe("the Overview's money", () => {
  it("shows the Money section only to roles with money", async () => {
    expect(await render("building", "support")).not.toContain("[billing facts]");
    expect(await render("building", "finance")).toContain("[billing facts]");
  });
});

describe("an address made before notices named their tab", () => {
  it("passes a notice on to the tab that shows it, with its query", async () => {
    vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role: "finance" } }, client: client("building") } as never);
    const open = (query: Record<string, string>): Promise<unknown> =>
      ClientOverviewPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(query) });
    await expect(open({ payment: "recorded" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing?payment=recorded`);
    await expect(open({ preview: "sent" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?preview=sent`);
    await expect(open({ calls: "held" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/requests?calls=held`);
  });
});
