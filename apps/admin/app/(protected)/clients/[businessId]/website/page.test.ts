import type { ProjectStatus } from "@brandbasket/db";
import {
  findBusinessWebsiteUrl,
  findLatestKickoffOutcome,
  findLatestProjectEventAt,
  findOpenProjectForStaff,
  findSetupCallBooking,
  listFeedbackForProject,
  listLaunchChecks,
  listPreviewVersions,
} from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { openClientTab } from "@/lib/server/client-page";
import ClientWebsitePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ isWebsiteBought: vi.fn() }));
vi.mock("@/lib/server/project-launch", () => ({ LAUNCH_RESEND_WINDOW_MS: 7 * 24 * 60 * 60 * 1000 }));
vi.mock("./site-details", () => ({ SiteDetails: () => "[site details]" }));
vi.mock("@/components/project-controls", () => ({ ProjectControls: () => "[project controls]" }));
vi.mock("@/components/console/kickoff-call-section", () => ({ KickoffCallSection: () => "[kickoff call]" }));
vi.mock("@/components/console/free-address-form", () => ({ FreeAddressForm: () => "[free address]" }));
vi.mock("@/components/console/website-section", () => ({ StartBuildingForm: () => "[start building]", WebsiteSection: () => "[website build]" }));
vi.mock("@/app/(protected)/clients/[businessId]/actions", () => ({
  checkAddressAction: vi.fn(),
  markDomainReadyAction: vi.fn(),
  markLiveAction: vi.fn(),
  recordManualPaymentAction: vi.fn(),
  resendLaunchEmailAction: vi.fn(),
  resendPreviewEmailAction: vi.fn(),
  rotateSiteApiTokenAction: vi.fn(),
  saveLaunchChecksAction: vi.fn(),
  saveWebsiteHostingAction: vi.fn(),
  sendPreviewAction: vi.fn(),
  setWebsiteUrlAction: vi.fn(),
  switchDomainAction: vi.fn(),
}));
vi.mock("@/app/(protected)/clients/[businessId]/tracking-actions", () => ({ createSiteKeyAction: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findBusinessWebsiteUrl: vi.fn(),
    findLatestKickoffOutcome: vi.fn(),
    findLatestProjectEventAt: vi.fn(),
    findOpenProjectForStaff: vi.fn(),
    findSetupCallBooking: vi.fn(),
    listFeedbackForProject: vi.fn(),
    listLaunchChecks: vi.fn(),
    listPreviewVersions: vi.fn(),
  };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const PROJECT = "01a0f71b-8402-7d48-a90a-207e8c8a0001";
const TICKET = "01a19bd4-4cef-7f21-a01c-419e207c7cee";
const RAW_CODE = "FY-01A19BD44CE77F21A01C419E207C7CEED";
const NEVER = new Date("2099-01-01T00:00:00Z");
/** The late text the card shows beside the stage name. */
const LATE = /Preview (\d+ days? late|overdue)/;

function client(status: ProjectStatus | null): never {
  return {
    businessId: BUSINESS,
    businessName: "Harbour Bakery",
    movingTo: null,
    domain: null,
    brief: null,
    media: [],
    billing: { subscription: null, firstPayment: null },
    project:
      status === null
        ? null
        : {
            id: PROJECT,
            status,
            onboardingSubmittedAt: null,
            slaDueAt: NEVER,
            previewUrl: status === "building" || status === "submitted" || status === "onboarding" ? null : "https://preview.example.com/v2",
            previewSentAt: status === "building" || status === "submitted" || status === "onboarding" ? null : new Date("2026-11-03T06:30:00Z"),
            revisionRoundsGranted: 1,
            launchedAt: status === "live" ? new Date("2026-11-04T06:30:00Z") : null,
            createdAt: new Date("2026-10-20T06:30:00Z"),
          },
  } as never;
}

function openBuild(status: ProjectStatus): never {
  return { id: PROJECT, businessId: BUSINESS, status, onHoldReason: null, revisionRoundsIncluded: 2, revisionRoundsUsed: 1, assignedStaffId: null, launchPlannedOn: null } as never;
}

const FEEDBACK = [
  {
    ticketId: TICKET,
    displayRef: RAW_CODE,
    subject: "Preview feedback, round 1: Make the logo bigger",
    body: "Make the logo bigger and move the phone number to the top.",
    status: "in_progress" as const,
    round: 1,
    createdAt: new Date("2026-11-02T06:30:00Z"),
  },
];

const VERSIONS = [
  { version: 2, previewUrl: "https://preview.example.com/v2", sentAt: new Date("2026-11-03T06:30:00Z"), sentByStaffId: null },
  { version: 1, previewUrl: "https://preview.example.com/v1", sentAt: new Date("2026-11-01T06:30:00Z"), sentByStaffId: null },
];

async function render(
  status: ProjectStatus | null,
  options: { readonly feedback?: boolean; readonly versions?: boolean; readonly bought?: boolean; readonly search?: Record<string, string> } = {},
): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { user: { id: "staff-1" } }, client: client(status) } as never);
  vi.mocked(listFeedbackForProject).mockResolvedValue(options.feedback ? FEEDBACK : []);
  vi.mocked(listPreviewVersions).mockResolvedValue(options.versions ? VERSIONS : []);
  vi.mocked(isWebsiteBought).mockResolvedValue(options.bought ?? true);
  vi.mocked(findOpenProjectForStaff).mockResolvedValue(status === null || status === "live" ? null : openBuild(status));
  const element = await ClientWebsitePage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(options.search ?? {}) });
  return renderToStaticMarkup(element);
}

function foldTag(html: string, title: string): string {
  const match = new RegExp(`<details[^>]*>(?=<summary[^>]*><span[^>]*>${title})`).exec(html);
  return match?.[0] ?? "";
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findBusinessWebsiteUrl).mockResolvedValue(null);
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(findLatestKickoffOutcome).mockResolvedValue(null);
  vi.mocked(listLaunchChecks).mockResolvedValue([]);
  vi.mocked(findLatestProjectEventAt).mockResolvedValue(null);
});

describe("the Website tab", () => {
  it("opens with the next-step card, then the facts, then the folds", async () => {
    const html = await render("building", { versions: true, feedback: true });
    const order = ["Next step", "Customer sees", "Preview versions", "Customer feedback", "More controls", "Notes for the builder", "[kickoff call]", "Site details"].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("drops the old Build block and the blank preview section", async () => {
    const html = await render("building", { versions: true });
    expect(html).not.toContain('aria-labelledby="section-build"');
    expect(html).not.toContain("Send a preview");
    expect(html).not.toContain("Preview history");
    expect(html).not.toContain("<dt class=\"text-xs text-ink-2\">Preview link");
    expect(html).not.toContain("Preview sent");
    expect(html).not.toContain("Revision rounds used");
  });

  it("says no project yet when there is none", async () => {
    const html = await render(null);
    expect(html).toContain("No project yet.");
    expect(html).not.toContain("Next step");
  });

  it("shows rounds once, as N of M", async () => {
    const html = await render("revisions", { feedback: true });
    expect(html.match(/>1 of 2</g)).toHaveLength(1);
    expect(html).not.toContain("Rounds of changes used");
  });

  it("uses one name for the stage in the card", async () => {
    expect(await render("revisions", { feedback: true })).toContain("Changes requested");
    expect(await render("preview", { versions: true })).toContain("Awaiting client review");
  });
});

describe("Site details", () => {
  it("holds the customer's site data in one fold, shut, after the delivery path", async () => {
    const html = await render("building");
    expect(html.match(/<summary[^>]*><span[^>]*>Site details/g)).toHaveLength(1);
    expect(foldTag(html, "Site details")).not.toContain(" open");
    expect(html.indexOf("[site details]")).toBeGreaterThan(html.indexOf("Site details"));
    expect(html.indexOf("[kickoff call]")).toBeLessThan(html.indexOf("Site details"));
  });

  it("is there with no project, so the site data stays reachable", async () => {
    const html = await render(null);
    expect(html).toContain("No project yet.");
    expect(html).toContain("[site details]");
  });

  it("opens when a notice it prints is in the address", async () => {
    for (const key of ["website", "hosting", "features", "listing", "tags"]) {
      expect(foldTag(await render("building", { search: { [key]: "saved" } }), "Site details"), key).toContain(" open");
    }
    expect(foldTag(await render("building", { search: { preview: "sent" } }), "Site details")).not.toContain(" open");
  });
});

describe("the Website tab by stage", () => {
  it("building: the first preview form, folds shut", async () => {
    const html = await render("building", { versions: true, feedback: true });
    expect(html).toContain("Send the first preview");
    expect(html).toContain("First preview due");
    expect(foldTag(html, "Preview versions")).not.toContain(" open");
    expect(foldTag(html, "Customer feedback")).not.toContain(" open");
    expect(foldTag(html, "More controls")).not.toContain(" open");
  });

  it("preview sent: waits, resends the email, hides the due date and opens the versions", async () => {
    const html = await render("preview", { versions: true });
    expect(html).toContain("Waiting for the customer&#x27;s review");
    expect(html).toContain("Resend email");
    expect(html).not.toContain("preview due");
    expect(foldTag(html, "Preview versions")).toContain(" open");
    expect(html.match(/href="https:\/\/preview\.example\.com\/v2"/g)).toHaveLength(1);
  });

  it("changes requested: quotes the customer, links the request, keeps the folds shut and never prints the ticket code", async () => {
    const html = await render("revisions", { feedback: true, versions: true });
    expect(html).toContain("Make the customer&#x27;s changes");
    expect(html).toContain("“Make the logo bigger and move the phone number to the top.”");
    expect(html).toContain("Round 1 of 2");
    expect(html).toContain(`href="/support/${TICKET}"`);
    expect(html).toContain("Updated preview due");
    expect(html).toContain("Send updated preview");
    expect(html).not.toContain(RAW_CODE);
    expect(html).not.toContain("FY-01A19BD4");
    expect(foldTag(html, "Customer feedback")).not.toContain(" open");
    expect(foldTag(html, "Preview versions")).not.toContain(" open");
  });

  it("changes requested: the due date and the late text come from the day the changes were asked, as the customer sees them", async () => {
    vi.useFakeTimers();
    try {
      // Asked Mon 2 Nov 2026 in India, so the updated preview is promised Wed 4 Nov. The first preview's date (2099) is not used.
      vi.mocked(findLatestProjectEventAt).mockResolvedValue(new Date("2026-11-02T10:00:00Z"));
      vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
      const onTime = await render("revisions", { feedback: true });
      expect(onTime).toContain("Updated preview due");
      expect(onTime).toContain("4 November 2026");
      expect(onTime).not.toMatch(LATE);

      vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
      const late = await render("revisions", { feedback: true });
      expect(late).toContain("Preview 1 day late");
    } finally {
      vi.useRealTimers();
    }
  });

  it("changes requested with no recorded ask: Not given and no late text", async () => {
    const html = await render("revisions", { feedback: true });
    expect(html).toContain("Updated preview due");
    expect(html).toContain("Not given");
    expect(html).not.toMatch(LATE);
  });

  it("building: the first preview's date still decides late", async () => {
    vi.mocked(findLatestProjectEventAt).mockResolvedValue(new Date("2026-11-02T10:00:00Z"));
    const html = await render("building");
    expect(html).not.toMatch(LATE);
    expect(findLatestProjectEventAt).not.toHaveBeenCalled();
  });

  it("submitted: only Start building", async () => {
    const html = await render("submitted");
    expect(html).toContain("[start building]");
    expect(html).not.toContain('name="previewUrl"');
  });

  it("live: nothing needed, and no rounds or launch day to show", async () => {
    const html = await render("live");
    expect(html).toContain("Nothing needed");
    expect(html).not.toContain("Rounds used");
  });
});

describe("More controls", () => {
  it("holds the website build and build controls, shut by default", async () => {
    const html = await render("building");
    expect(html).toContain("[project controls]");
    expect(html).toContain("[website build]");
    expect(foldTag(html, "More controls")).not.toContain(" open");
  });

  it("opens for a build on hold, and when a move or build notice has to be read", async () => {
    expect(foldTag(await render("on_hold"), "More controls")).toContain(" open");
    expect(foldTag(await render("building", { search: { move: "round-added" } }), "More controls")).toContain(" open");
    expect(foldTag(await render("building", { search: { build: "paused" } }), "More controls")).toContain(" open");
    expect(foldTag(await render("building", { search: { move: "nonsense" } }), "More controls")).not.toContain(" open");
  });

  it("is left out when the website was not bought and there is no launch email to resend", async () => {
    expect(await render("building", { bought: false })).not.toContain("More controls");
  });
});
