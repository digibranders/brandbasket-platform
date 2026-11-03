import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { WebsiteScreen, type WebsiteScreenProps } from "./components/website-screen";
import { loadWebsiteOverview, type WebsiteCore } from "./loader";

/*
 * Loader failure behaviour: each panel loads on its own and a failed read shows that panel's error, never a wrong screen. The
 * old page read the preview versions quietly, so a failure said "No preview has been sent yet" and took Approve away.
 */

vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => undefined) }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}), getStaffDb: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: () => undefined }));
vi.mock("./actions", () => ({ approvePreviewAction: vi.fn(), sendPreviewFeedbackAction: vi.fn() }));

const db = vi.hoisted(() => ({
  listPreviewVersions: vi.fn(),
  findPreviewImageInfo: vi.fn(),
  listProjectEvents: vi.fn(),
  findSetupCallBooking: vi.fn(),
  findClientIntake: vi.fn(),
  listEnquiries: vi.fn(),
  findSiteHealthFacts: vi.fn(),
  findAnalyticsConnection: vi.fn(),
  findSearchConnection: vi.fn(),
  listSearchDays: vi.fn(),
  listVisitDays: vi.fn(),
  listVisitLists: vi.fn(),
}));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({}),
  ...db,
}));

const NOW = new Date("2026-11-03T06:00:00.000Z");
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";

const context = {
  tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Apex", role: "owner" },
  businessId: BUSINESS_ID,
  businessName: "Apex",
  role: "owner",
} as unknown as CustomerContext;

function core(status: string, live = false): WebsiteCore {
  return {
    project: {
      id: "project-1",
      status,
      previewUrl: "https://preview.test/apex",
      revisionRoundsIncluded: 2,
      revisionRoundsGranted: 0,
      onHoldReason: null,
      onboardingSubmittedAt: null,
      slaDueAt: null,
      previewSentAt: NOW,
      launchedAt: live ? NOW : null,
      launchPlannedOn: null,
    } as unknown as WebsiteCore["project"],
    domain: { hostname: "apex.in", status: live ? "active" : "pending", isFreeAddress: false },
    live: live ? { hostname: "apex.in", launchedAt: NOW } : null,
  };
}

function screenProps(websiteCore: WebsiteCore, overview: WebsiteScreenProps["overview"], pages: WebsiteScreenProps["pages"] = null): WebsiteScreenProps {
  return { context, core: websiteCore, overview, pages, notice: null, feedbackKey: "feedback-key-12345678", now: NOW };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  db.findAnalyticsConnection.mockResolvedValue(null);
  db.findSearchConnection.mockResolvedValue(null);
  db.listSearchDays.mockResolvedValue([]);
  db.listVisitDays.mockResolvedValue([]);
  db.listVisitLists.mockResolvedValue([]);
  db.listProjectEvents.mockResolvedValue([]);
  db.findSetupCallBooking.mockResolvedValue(null);
  db.findPreviewImageInfo.mockResolvedValue(null);
  db.listPreviewVersions.mockResolvedValue([{ version: 1, previewUrl: "https://preview.test/apex", sentAt: NOW, sentByStaffId: null }]);
  db.listEnquiries.mockResolvedValue([]);
  db.findSiteHealthFacts.mockResolvedValue({ latest: null, firstCheckedAt: null, up: 0, down: 0, certificate: null, phoneSpeed: null });
});

describe("loadWebsiteOverview", () => {
  it("returns the preview panel's failure on its own when the versions cannot be read", async () => {
    db.listPreviewVersions.mockRejectedValue(new Error("connection lost"));
    const overview = await loadWebsiteOverview(context, core("preview"), NOW);
    expect(overview.preview?.ok).toBe(false);
    expect(overview.history?.ok).toBe(true);
  });

  it("reads the first questions only while onboarding, and reports a failed read instead of guessing", async () => {
    expect((await loadWebsiteOverview(context, core("building"), NOW)).kickoffFirst).toBeNull();
    db.findClientIntake.mockRejectedValue(new Error("connection lost"));
    expect((await loadWebsiteOverview(context, core("onboarding"), NOW)).kickoffFirst?.ok).toBe(false);
  });

  it("counts website enquiries only once live", async () => {
    expect((await loadWebsiteOverview(context, core("preview"), NOW)).enquiries).toBeNull();
    db.listEnquiries.mockResolvedValue([{ receivedAt: NOW }, { receivedAt: new Date("2026-09-01T00:00:00Z") }]);
    expect((await loadWebsiteOverview(context, core("live", true), NOW)).enquiries).toEqual({ ok: true, data: 1 });
  });
});

describe("WebsiteScreen", () => {
  it("shows the preview's error, not 'no preview yet', and keeps Approve and Ask for changes", async () => {
    db.listPreviewVersions.mockRejectedValue(new Error("connection lost"));
    const websiteCore = core("preview");
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW))} />);
    expect(screen.getByText(/We could not load your preview/)).toBeTruthy();
    expect(screen.queryByText(/No preview has been sent/)).toBeNull();
    expect(screen.getByRole("button", { name: "Approve and go live" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for changes" })).toBeTruthy();
    expect(screen.getByText("Two rounds of changes are included.")).toBeTruthy();
  });

  it("shows an error instead of guessing between setup and kickoff", async () => {
    db.findClientIntake.mockRejectedValue(new Error("connection lost"));
    const websiteCore = core("onboarding");
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW))} />);
    expect(screen.getByText(/We could not load your website's progress/)).toBeTruthy();
    expect(screen.queryByText("Finish your setup")).toBeNull();
  });

  it("shows no visits or sources once live, and no Pages tab without pages", async () => {
    const websiteCore = core("live", true);
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(screen.getByText("Enquiries from the site")).toBeTruthy();
    for (const absent of [/visits/i, /where visitors come from/i]) expect(screen.queryByText(absent)).toBeNull();
    expect(screen.queryByRole("link", { name: "Pages" })).toBeNull();
    expect(screen.getByRole("link", { name: "Domain" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask for a change" }).getAttribute("href")).toBe("/requests?new=1&about=website");
  });

  it("reads site health only once live, and says checks start before there is one", async () => {
    expect((await loadWebsiteOverview(context, core("preview"), NOW)).health).toBeNull();
    const websiteCore = core("live", true);
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(screen.getByText("Site health")).toBeTruthy();
    expect(screen.getByText("Checks start once your website is live.")).toBeTruthy();
  });

  it("shows the checks as measured, and the panel's own error when they cannot be read", async () => {
    db.findSiteHealthFacts.mockResolvedValue({
      latest: { status: "up", checkedAt: NOW },
      firstCheckedAt: new Date("2026-10-01T00:00:00Z"),
      up: 999,
      down: 1,
      certificate: { expiresAt: new Date("2027-02-04T00:00:00Z"), checkedAt: NOW },
      phoneSpeed: { score: 82, checkedAt: NOW },
    });
    const websiteCore = core("live", true);
    const { unmount } = render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    for (const text of ["Your website is up", "Online 99.9% of the last 30 days", "Secure connection valid until Thu 4 Feb 2027", "Speed on phones: 82 out of 100"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    unmount();
    db.findSiteHealthFacts.mockRejectedValue(new Error("connection lost"));
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(screen.getByText(/We could not load your site health/)).toBeTruthy();
    expect(screen.getByText("Enquiries from the site")).toBeTruthy();
  });

  it("lists pages and shows the Pages tab when the sync found some", async () => {
    const websiteCore = core("live", true);
    const page = { businessId: BUSINESS_ID, url: "https://apex.in/tests", title: null, lastSeenAt: NOW, createdAt: NOW };
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [page] })} />);
    expect(screen.getByRole("link", { name: "Pages" })).toBeTruthy();
    expect(screen.getByText("/tests")).toBeTruthy();
  });
});

/** Thirty measured days ending yesterday (India) in a source's rows. */
function visitDays(value: number, count = 30) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 10, 2 - index)).toISOString().slice(0, 10);
    return { metric: "visits", day, value, fetchedAt: NOW };
  }).reverse();
}

describe("website visits (gate G1)", () => {
  it("reads nothing and draws nothing while the switch is off", async () => {
    const websiteCore = core("live", true);
    const overview = await loadWebsiteOverview(context, websiteCore, NOW);
    expect(overview.visits).toBeNull();
    expect(db.listVisitDays).not.toHaveBeenCalled();
    render(<WebsiteScreen {...screenProps(websiteCore, overview, { ok: true, data: [] })} />);
    expect(screen.queryByText("Visits by day")).toBeNull();
  });

  it("is not read before the site is live, even with the switch on", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    expect((await loadWebsiteOverview(context, core("preview"), NOW)).visits).toBeNull();
    expect(db.listVisitDays).not.toHaveBeenCalled();
  });

  it("has no data, and draws no panel, until a day has been counted", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    const websiteCore = core("live", true);
    const overview = await loadWebsiteOverview(context, websiteCore, NOW);
    expect(overview.visits).toEqual({ ok: true, data: null });
    render(<WebsiteScreen {...screenProps(websiteCore, overview, { ok: true, data: [] })} />);
    expect(screen.queryByText("Visits")).toBeNull();
    expect(screen.queryByText("Where visitors come from")).toBeNull();
  });

  it("draws our own counts with their dates: the total, the chart, the pages and where visitors came from", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "true");
    db.listVisitDays.mockResolvedValue([...visitDays(10, 60).slice(0, 30), ...visitDays(12)]);
    db.listVisitLists.mockImplementation(async (_tx: unknown, _source: string, month: string) =>
      month === "2026-11-01"
        ? [
            { dimension: "page", rows: [{ key: "/book", count: 120 }, { key: "/", count: 80 }], fetchedAt: NOW },
            { dimension: "channel", rows: [{ key: "search", count: 60 }, { key: "direct", count: 30 }], fetchedAt: NOW },
          ]
        : [],
    );
    const websiteCore = core("live", true);
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(db.listVisitDays).toHaveBeenCalledWith(expect.anything(), "own", "2026-09-04", "2026-11-02");
    expect(screen.getByText("360")).toBeTruthy();
    expect(screen.getByText("+20%")).toBeTruthy();
    expect(screen.getByText("Visits by day")).toBeTruthy();
    expect(screen.getByText("Most visited pages")).toBeTruthy();
    expect(screen.getByText("/book")).toBeTruthy();
    expect(screen.getByText("Where visitors come from")).toBeTruthy();
    expect(screen.getByText("Search engines")).toBeTruthy();
    expect(screen.getAllByText(/Updated/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/From Google Analytics/)).toBeNull();
  });

  it("uses Google Analytics once it is connected and has counted, and says so", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findAnalyticsConnection.mockResolvedValue({ status: "connected" });
    db.listVisitDays.mockImplementation(async (_tx: unknown, source: string) => (source === "ga4" ? visitDays(7) : visitDays(99)));
    const websiteCore = core("live", true);
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(db.listVisitDays).not.toHaveBeenCalledWith(expect.anything(), "own", expect.anything(), expect.anything());
    expect(screen.getByText("210")).toBeTruthy();
    expect(screen.getAllByText(/From Google Analytics/).length).toBeGreaterThan(0);
  });

  it("falls back to our own counts when Google Analytics is not connected or has counted nothing", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findAnalyticsConnection.mockResolvedValue({ status: "access_lost" });
    db.listVisitDays.mockResolvedValue(visitDays(4));
    const overview = await loadWebsiteOverview(context, core("live", true), NOW);
    expect(overview.visits?.ok && overview.visits.data?.summary).toMatchObject({ source: "own", total: 120 });
  });

  it("says numbers start within 2 to 3 days while a connected Google site has no measured day, and never a 0", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findAnalyticsConnection.mockResolvedValue({ status: "connected" });
    const websiteCore = core("live", true);
    const overview = await loadWebsiteOverview(context, websiteCore, NOW);
    expect(overview.visits).toEqual({ ok: true, data: null });
    expect(overview.visitsWaiting).toEqual({ ok: true, data: true });
    render(<WebsiteScreen {...screenProps(websiteCore, overview, { ok: true, data: [] })} />);
    expect(screen.getByText("Visits")).toBeTruthy();
    expect(screen.getByText("Numbers start within 2 to 3 days")).toBeTruthy();
    expect(screen.getByText("Not yet")).toBeTruthy();
  });

  it("says it for a connected Search Console site with no measured clicks day, and not once one is measured", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findSearchConnection.mockResolvedValue({ status: "connected" });
    expect((await loadWebsiteOverview(context, core("live", true), NOW)).visitsWaiting).toEqual({ ok: true, data: true });
    db.listSearchDays.mockResolvedValue([{ metric: "clicks", day: "2026-10-30", value: 3, fetchedAt: NOW }]);
    expect((await loadWebsiteOverview(context, core("live", true), NOW)).visitsWaiting).toEqual({ ok: true, data: false });
  });

  it("says nothing without a connected Google site, and asks nothing once visits have days", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findSearchConnection.mockResolvedValue({ status: "access_lost" });
    db.findAnalyticsConnection.mockResolvedValue({ status: "pending" });
    const websiteCore = core("live", true);
    const none = await loadWebsiteOverview(context, websiteCore, NOW);
    expect(none.visitsWaiting).toEqual({ ok: true, data: false });
    render(<WebsiteScreen {...screenProps(websiteCore, none, { ok: true, data: [] })} />);
    expect(screen.queryByText(/Numbers start within/)).toBeNull();
    db.listVisitDays.mockResolvedValue(visitDays(4));
    db.findSearchConnection.mockClear();
    expect((await loadWebsiteOverview(context, websiteCore, NOW)).visitsWaiting).toBeNull();
    expect(db.findSearchConnection).not.toHaveBeenCalled();
  });

  it("reads no connection and says nothing about waiting while the visits switch is off", async () => {
    db.findAnalyticsConnection.mockResolvedValue({ status: "connected" });
    const overview = await loadWebsiteOverview(context, core("live", true), NOW);
    expect(overview.visitsWaiting).toBeNull();
    expect(db.findSearchConnection).not.toHaveBeenCalled();
  });

  it("leaves the strip as it was, and reports, when the waiting check cannot be read", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.findSearchConnection.mockRejectedValue(new Error("connection lost"));
    const websiteCore = core("live", true);
    const overview = await loadWebsiteOverview(context, websiteCore, NOW);
    expect(overview.visitsWaiting?.ok).toBe(false);
    render(<WebsiteScreen {...screenProps(websiteCore, overview, { ok: true, data: [] })} />);
    expect(screen.queryByText(/Numbers start within/)).toBeNull();
  });

  it("names its own failure and keeps the rest of the page", async () => {
    vi.stubEnv("CUSTOMER_VISITS_ENABLED", "1");
    db.listVisitDays.mockRejectedValue(new Error("connection lost"));
    const websiteCore = core("live", true);
    render(<WebsiteScreen {...screenProps(websiteCore, await loadWebsiteOverview(context, websiteCore, NOW), { ok: true, data: [] })} />);
    expect(screen.getByText(/We could not load your visits/)).toBeTruthy();
    expect(screen.getByText("Enquiries from the site")).toBeTruthy();
  });
});
