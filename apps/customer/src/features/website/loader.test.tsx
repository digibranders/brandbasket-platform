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
