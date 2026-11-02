import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectStatus } from "@brandbasket/db";
import { describe, expect, it, vi } from "vitest";
import { DeliveryFacts, FeedbackList, NextStepCard, PreviewVersionList, type LatestFeedback } from "./delivery-tab";
import { Fold } from "./fold";

vi.mock("server-only", () => ({}));
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
vi.mock("@/app/(protected)/clients/[businessId]/website-actions", () => ({
  startBuildingAction: vi.fn(),
  putOnHoldAction: vi.fn(),
  resumeBuildingAction: vi.fn(),
  retakePreviewPictureAction: vi.fn(),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const TICKET = "01a19bd4-4cef-7f21-a01c-419e207c7cee";
const RAW_CODE = "FY-01A19BD44CE77F21A01C419E207C7CEED";

const FEEDBACK: LatestFeedback = {
  ticketId: TICKET,
  subject: "Preview feedback, round 1: Make the logo bigger",
  body: "Make the logo bigger and move the phone number to the top.",
  createdAt: new Date("2026-11-02T06:30:00Z"),
};

function card(status: ProjectStatus, extra: Partial<Parameters<typeof NextStepCard>[0]> = {}): string {
  return renderToStaticMarkup(
    NextStepCard({
      businessId: BUSINESS,
      status,
      late: null,
      rounds: { used: 1, included: 2 },
      latestFeedback: null,
      goLive: { doneChecks: [], domain: null, previewUrl: "https://preview.example.com/site", addressUnverified: false },
      ...extra,
    }),
  );
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1] ?? "");
}

describe("NextStepCard", () => {
  it("says what to do, in the words for each stage", () => {
    expect(card("onboarding")).toContain("Waiting for the customer&#x27;s setup");
    expect(card("submitted")).toContain("Start building");
    expect(card("building")).toContain("Send the first preview");
    expect(card("preview")).toContain("Waiting for the customer&#x27;s review");
    expect(card("revisions")).toContain("Make the customer&#x27;s changes");
    expect(card("approved")).toContain("Go live");
    expect(card("live")).toContain("Nothing needed");
  });

  it("names the stage with the staff name the header chip uses, and leads with Next step", () => {
    const html = card("revisions");
    expect(html).toContain("Next step");
    expect(html).toContain("Changes requested");
    expect(card("preview")).toContain("Awaiting client review");
  });

  it("has the action for each stage and no other", () => {
    expect(buttons(card("onboarding"))).toEqual([]);
    expect(buttons(card("submitted"))).toEqual(["Start building"]);
    expect(buttons(card("building"))).toEqual(["Send preview"]);
    expect(buttons(card("preview"))).toEqual(["Resend email"]);
    expect(buttons(card("revisions"))).toEqual(["Send updated preview"]);
    expect(buttons(card("approved"))).toEqual(["Save checks", "Mark live"]);
    expect(buttons(card("live"))).toEqual([]);
    expect(buttons(card("cancelled"))).toEqual([]);
  });

  it("does not offer a preview form while the build has not started", () => {
    expect(card("submitted")).not.toContain('name="previewUrl"');
    expect(card("onboarding")).not.toContain('name="previewUrl"');
  });

  it("keeps the send button looking like a button when the link is empty, and checks the link when it is sent", () => {
    const html = card("building");
    const button = /<button[^>]*>Send preview<\/button>/.exec(html)?.[0] ?? "";
    expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(button).toContain("formNoValidate");
    expect(html).toContain('name="previewUrl"');
  });

  it("shows the late reason next to the stage when a preview is overdue", () => {
    expect(card("building", { late: "Preview 2 days late" })).toContain("Preview 2 days late");
    expect(card("building")).not.toContain("days late");
  });

  it("marks the go-live card as the domain anchor", () => {
    expect(card("approved")).toContain('id="domain"');
    expect(card("building")).not.toContain('id="domain"');
  });

  it("points an on-hold build at Resume", () => {
    const html = card("on_hold");
    expect(html).toContain("The build is on hold");
    expect(html).toContain("Resume");
  });
});

describe("NextStepCard when changes are requested", () => {
  const html = card("revisions", { latestFeedback: FEEDBACK });

  it("quotes what the customer wrote, with the round and when they asked", () => {
    expect(html).toContain("“Make the logo bigger and move the phone number to the top.”");
    expect(html).toContain("Round 1 of 2");
    expect(html).toContain("Asked");
    expect(html).toContain('dateTime="2026-11-02T06:30:00.000Z"');
  });

  it("links to the request and shows no ticket code", () => {
    expect(html).toContain(`href="/support/${TICKET}"`);
    expect(html).toContain("Open the request");
    expect(html).not.toContain(RAW_CODE);
  });

  it("asks for the new version with the updated button", () => {
    expect(html).toContain("When the changes are done, send the new version.");
    expect(buttons(html)).toEqual(["Send updated preview"]);
    expect(html).toContain('name="previewUrl"');
  });

  it("falls back to the subject when the message is missing, and to the old line when there is no feedback", () => {
    expect(card("revisions", { latestFeedback: { ...FEEDBACK, body: null } })).toContain("Preview feedback, round 1: Make the logo bigger");
    const none = card("revisions");
    expect(none).toContain("They asked for changes. What they wrote is in Requests.");
    expect(none).not.toContain("Open the request");
  });

  it("escapes what the customer wrote", () => {
    const evil = card("revisions", { latestFeedback: { ...FEEDBACK, body: "<img src=x onerror=alert(1)>" } });
    expect(evil).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(evil).not.toContain("<img");
  });
});

describe("DeliveryFacts", () => {
  const build = { rounds: { used: 1, included: 2 }, launchPlannedOn: "2026-11-20" };
  const facts = (status: ProjectStatus, extra: Partial<Parameters<typeof DeliveryFacts>[0]> = {}): string =>
    renderToStaticMarkup(DeliveryFacts({ status, slaDueAt: new Date("2026-11-05T06:30:00Z"), build, kickoffConfirmed: null, ...extra }));

  it("shows what the customer sees, in the customer's words", () => {
    expect(facts("building")).toContain("Customer sees");
    expect(facts("building")).toContain("We are building your website");
  });

  it("names the due date for the stage and hides it once the preview is waiting", () => {
    expect(facts("building")).toContain("First preview due");
    expect(facts("submitted")).toContain("First preview due");
    expect(facts("revisions")).toContain("Updated preview due");
    expect(facts("revisions")).not.toContain("First preview due");
    for (const status of ["preview", "approved", "live", "onboarding"] as const) {
      expect(facts(status)).not.toContain("preview due");
    }
  });

  it("says Not given when a due stage has no date", () => {
    expect(facts("building", { slaDueAt: null })).toContain("Not given");
  });

  it("shows rounds as N of M, from the one figure the controls use", () => {
    expect(facts("revisions")).toContain("Rounds used");
    expect(facts("revisions")).toContain(">1 of 2<");
    expect(facts("revisions", { build: { ...build, rounds: { used: 0, included: 3 } } })).toContain(">0 of 3<");
  });

  it("shows the planned launch day, or Not set", () => {
    expect(facts("building")).toContain("Planned launch day");
    expect(facts("building")).toContain("20 November 2026");
    expect(facts("building", { build: { ...build, launchPlannedOn: null } })).toContain("Not set");
  });

  it("leaves out rounds and launch day once the build is closed", () => {
    const html = facts("live", { build: null });
    expect(html).not.toContain("Rounds used");
    expect(html).not.toContain("Planned launch day");
  });

  it("shows the kickoff only when there is one to speak of", () => {
    expect(facts("building")).not.toContain("Kickoff");
    expect(facts("building", { kickoffConfirmed: true })).toContain("Confirmed by staff");
    expect(facts("building", { kickoffConfirmed: false })).toContain("Started automatically, not confirmed by staff");
  });

  it("wraps on a phone instead of scrolling sideways", () => {
    expect(facts("building")).toContain("grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]");
  });
});

describe("PreviewVersionList", () => {
  const html = renderToStaticMarkup(
    PreviewVersionList({
      versions: [
        { version: 2, previewUrl: "https://preview.example.com/v2", sentAt: new Date("2026-11-03T06:30:00Z") },
        { version: 1, previewUrl: "https://preview.example.com/v1", sentAt: new Date("2026-11-01T06:30:00Z") },
      ],
    }),
  );

  it("lists each version with its link and date, newest first", () => {
    expect(html).toContain('href="https://preview.example.com/v2"');
    expect(html).toContain('href="https://preview.example.com/v1"');
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain('dateTime="2026-11-03T06:30:00.000Z"');
  });

  it("marks only the latest", () => {
    expect(html.match(/Latest/g)).toHaveLength(1);
    expect(html.indexOf("Latest")).toBeLessThan(html.indexOf("Version 1"));
  });
});

describe("FeedbackList", () => {
  const items = [
    { ticketId: TICKET, round: 2, subject: "Preview feedback, round 2: Fix the menu", body: "Fix the menu on phones.", createdAt: new Date("2026-11-03T06:30:00Z"), statusLabel: "In progress" },
    { ticketId: "01a19bd4-4cef-7f21-a01c-419e207c7cef", round: 1, subject: "Preview feedback, round 1: Logo", body: null, createdAt: new Date("2026-11-01T06:30:00Z"), statusLabel: "Resolved" },
  ];
  const html = renderToStaticMarkup(FeedbackList({ items }));

  it("shows a friendly round name, the text, the date and the status", () => {
    expect(html).toContain("Round 2");
    expect(html).toContain("Fix the menu on phones.");
    expect(html).toContain("In progress");
    expect(html).toContain('dateTime="2026-11-03T06:30:00.000Z"');
  });

  it("falls back to the subject when there is no message", () => {
    expect(html).toContain("Preview feedback, round 1: Logo");
  });

  it("links each round to its request and never prints a ticket code", () => {
    expect(html).toContain(`href="/support/${TICKET}"`);
    expect(html.match(/Open the request/g)).toHaveLength(2);
    expect(html).not.toContain(RAW_CODE);
    expect(html).not.toMatch(/FY-[0-9A-F]{8}/);
  });
});

describe("Fold", () => {
  const fold = (open?: boolean): string => renderToStaticMarkup(Fold({ title: "More controls", count: 3, open, children: "inside" }));

  it("is a native details element, closed unless asked", () => {
    expect(fold()).toMatch(/^<details/);
    expect(fold()).not.toMatch(/<details[^>]* open/);
    expect(fold(true)).toMatch(/<details[^>]* open/);
  });

  it("names itself in the summary and shows a count", () => {
    expect(fold()).toMatch(/<summary[^>]*>.*More controls.*3/);
  });
});
