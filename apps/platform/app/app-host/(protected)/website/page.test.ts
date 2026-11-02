import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadWebsite, type WebsiteData } from "@/lib/server/website";
import { progressView, type ProgressInput } from "@/lib/website/progress-view";
import { websiteTimeline, type TimelineEvent } from "@/lib/website/timeline";
import WebsitePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireWebsiteClient: vi.fn() }));
vi.mock("@/lib/server/website", () => ({ loadWebsite: vi.fn() }));
vi.mock("./actions", () => ({ approvePreviewAction: vi.fn(), sendPreviewFeedbackAction: vi.fn() }));

// En and em dash, written as escapes so this file holds none itself.
const DASHES = new RegExp("[\\u2013\\u2014]|&mdash;|&ndash;");
const NOW = new Date("2026-11-03T06:00:00.000Z");
const V1 = { version: 1, url: "https://www.example.com/preview", sentAt: new Date("2026-11-02T10:27:00.000Z") };
const V2 = { version: 2, url: "https://www.example.com/preview-2", sentAt: new Date("2026-11-04T05:50:00.000Z") };
const ASKED = { ticketId: "ticket-1", round: 1, body: "Update the hero heading", sentAt: new Date("2026-11-02T10:35:00.000Z") };

type Status = "onboarding" | "building" | "preview" | "revisions" | "approved" | "live" | "on_hold";

interface Stage {
  readonly status: Status;
  readonly versions?: WebsiteData["versions"];
  readonly changes?: WebsiteData["changes"];
  readonly input?: Partial<ProgressInput>;
  readonly granted?: number;
  readonly live?: boolean;
  readonly plannedLaunch?: string | null;
  readonly previewDue?: string | null;
}

/** What loadWebsite would give for a project in this stage. */
function stage(options: Stage): WebsiteData {
  const granted = options.granted ?? 0;
  const events: TimelineEvent[] = [{ status: "submitted", at: new Date("2026-10-30T06:00:00.000Z") }];
  const project = {
    id: "project-1",
    status: options.status,
    previewUrl: "https://www.example.com/preview",
    revisionRoundsIncluded: 2,
    revisionRoundsGranted: granted,
    launchedAt: options.live === true ? new Date("2026-11-09T05:00:00.000Z") : null,
  };
  return {
    project: project as never,
    domain: options.live === true ? ({ hostname: "www.example.com", status: "active" } as never) : null,
    live: options.live === true ? { hostname: "www.example.com", launchedAt: project.launchedAt } : null,
    events,
    steps: websiteTimeline({
      project: { status: options.status, onboardingSubmittedAt: null, slaDueAt: null, previewSentAt: null, launchedAt: project.launchedAt },
      events,
      callStartsAt: null,
      now: NOW,
    }),
    view: progressView({ status: options.status, holdReason: null, roundsIncluded: 2, roundsGranted: granted, previewDue: options.previewDue ?? null, liveBy: null, kickoffFirst: true, kickoffDay: null, ...options.input }),
    versions: options.versions ?? [],
    changes: options.changes ?? [],
    previewDue: options.previewDue ?? null,
    plannedLaunch: options.plannedLaunch ?? null,
    pictureUrl: null,
  };
}

async function render(options: Stage): Promise<string> {
  vi.mocked(loadWebsite).mockResolvedValue(stage(options));
  return renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve({}) })).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant: { businessName: "Riverside Plumbing" }, billing: { status: "active", hasAccess: true } } as never);
});

describe("the Website page", () => {
  it("sends a lapsed customer Home instead of the preview and its buttons", async () => {
    vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant: {}, billing: { status: "lapsed", hasAccess: false } } as never);
    await expect(WebsitePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/");
    expect(loadWebsite).not.toHaveBeenCalled();
  });

  it("keeps the empty state for a business with nothing being built", async () => {
    vi.mocked(loadWebsite).mockResolvedValue({ ...stage({ status: "building" }), project: null, view: progressView({ status: null, holdReason: null, roundsIncluded: 0, roundsGranted: 0, previewDue: null, liveBy: null, kickoffFirst: false, kickoffDay: null }) });
    const html = renderToStaticMarkup(await WebsitePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Nothing is being built right now");
    expect(html).toContain("Ask for a change");
  });
});

describe("the Website page, every stage", () => {
  it("starting: the kickoff step, a chip, an empty history and the way to the kickoff", async () => {
    const html = await render({ status: "onboarding" });
    expect(html).toContain("We start after your kickoff call");
    expect(html).toContain("Getting started");
    expect(html).toContain("See your kickoff");
    expect(html).toContain("No preview has been sent yet.");
    expect(html).not.toContain("Open preview");
  });

  it("building: the first preview day, with no versions yet and nothing to approve", async () => {
    const html = await render({ status: "building", input: { previewDue: "2026-11-05" } });
    expect(html).toContain("We are building your website");
    expect(html).toContain("Your first preview will be ready by Thu 5 Nov.");
    expect(html).toContain("Building");
    expect(html).toContain("No preview has been sent yet.");
    expect(html).toContain("What happens next");
    expect(html).not.toContain(">Approve</button>");
  });

  it("preview ready: Approve and Ask for changes on the newest version, with Open preview", async () => {
    const html = await render({ status: "preview", versions: [V1] });
    expect(html).toContain("Your preview is ready");
    expect(html).toContain("Ready to check");
    expect(html).toContain("Version 1");
    expect(html).toContain('href="https://www.example.com/preview" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">Approve</button>");
    expect(html).toContain(">Ask for changes</button>");
    expect(html).toContain("Changes used");
    expect(html).toContain("0 of 2");
  });

  it("preview ready after a round: the old version says what was done with it and the changes show Done in Version 2", async () => {
    const html = await render({ status: "preview", versions: [V2, V1], changes: [ASKED], granted: 1 });
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("You asked for changes");
    expect(html).toContain("Round 1 of 2");
    expect(html).toContain("Done in Version 2");
    expect(html).toContain("1 of 2");
    expect(html.match(/>Approve<\/button>/g)).toHaveLength(1);
  });

  it("preview ready with every round used: no Ask for changes box, further changes are quoted first", async () => {
    const html = await render({ status: "preview", versions: [V1], granted: 2 });
    expect(html).not.toContain(">Ask for changes</button>");
    expect(html).toContain("Further changes are quoted first.");
    expect(html).toContain(">Approve</button>");
  });

  it("changes in progress: the version being made on top, the round, what was asked and a link to the request", async () => {
    const html = await render({ status: "revisions", versions: [V1], changes: [ASKED], granted: 1, previewDue: "2026-11-04", plannedLaunch: "2026-11-09" });
    expect(html).toContain("We are making your changes");
    expect(html).toContain("Changes in progress");
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("In progress");
    expect(html).toContain("ready by");
    expect(html).toContain("Wed 4 Nov");
    expect(html).toContain("We are on it");
    expect(html).toContain("You asked for changes");
    expect(html).toContain("Round 1 of 2");
    expect(html).toContain("Update the hero heading");
    expect(html).toContain('href="/requests?open=ticket-1"');
    expect(html).toContain("The details");
    expect(html).toContain("Set before launch");
    expect(html).toContain("Planned launch");
    expect(html).toContain("Mon 9 Nov");
    expect(html).toContain("1 of 2");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain("Done in Version");
  });

  it("names no day that has passed", async () => {
    const html = await render({ status: "revisions", versions: [V1], changes: [ASKED], granted: 1, previewDue: null, plannedLaunch: null });
    expect(html).toContain("In progress");
    expect(html).not.toContain("ready by");
    expect(html).not.toContain("Planned launch");
  });

  it("approved: the newest version says you approved it, and nothing is left to answer", async () => {
    const html = await render({ status: "approved", versions: [V2, V1], changes: [ASKED], granted: 1 });
    expect(html).toContain("You approved the preview");
    expect(html).toContain("Going live");
    expect(html).toContain("You approved it");
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain("Live now");
  });

  it("on hold: the existing hold line, the history and no actions", async () => {
    const html = await render({ status: "on_hold", versions: [V1], input: { holdReason: "We need your logo file." } });
    expect(html).toContain("Your build is paused");
    expect(html).toContain("We need your logo file.");
    expect(html).toContain("Paused");
    expect(html).toContain("Open preview");
    expect(html).not.toContain(">Approve</button>");
  });

  it("live: the address in large type with Visit and Request an update, Live now in the history and live details", async () => {
    const html = await render({ status: "live", live: true, versions: [V2, V1], changes: [ASKED], granted: 1 });
    expect(html).toContain("Your website is live");
    expect(html).toContain("Your website");
    expect(html).toContain("text-3xl");
    expect(html).toContain(">www.example.com</p>");
    expect(html).toContain("Visit your website");
    expect(html).toContain('href="https://www.example.com/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Request an update");
    expect(html).toContain('href="/requests/new?kind=website&amp;page="');
    expect(html).toContain("Live now");
    expect(html).toContain("Done in Version 2");
    expect(html).toContain("Live since");
    expect(html).toContain("Mon 9 Nov");
    expect(html).toContain("Versions sent");
    expect(html).not.toContain("Changes used");
    expect(html).not.toContain("What happens next");
    expect(html).not.toContain("Pages and Enquiries appear here");
    expect(html).not.toContain(">Approve</button>");
  });
});

describe("what the page no longer shows", () => {
  it("has no What you bought card and no receipt link, in any stage", async () => {
    for (const status of ["onboarding", "building", "preview", "revisions", "approved", "on_hold"] as const) {
      const html = await render({ status, versions: [V1] });
      expect(html, status).not.toContain("What you bought");
      expect(html, status).not.toMatch(/receipt/i);
    }
    const live = await render({ status: "live", live: true, versions: [V1] });
    expect(live).not.toContain("What you bought");
    expect(live).not.toMatch(/receipt/i);
  });

  it("says Pages and Enquiries come once live, in every stage before launch", async () => {
    for (const status of ["onboarding", "building", "preview", "revisions", "approved", "on_hold"] as const) {
      expect(await render({ status, versions: [V1] }), status).toContain("Pages and Enquiries appear here once your website is live.");
    }
  });

  it("uses no em or en dash in anything it draws", async () => {
    for (const status of ["building", "preview", "revisions", "approved", "live"] as const) {
      const html = await render({ status, live: status === "live", versions: [V2, V1], changes: [ASKED], granted: 1, previewDue: "2026-11-04", plannedLaunch: "2026-11-09" });
      expect(html, status).not.toMatch(DASHES);
    }
  });
});
