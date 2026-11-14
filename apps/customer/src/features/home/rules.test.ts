import type { RequestNeed, WaitingOnYou } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  activityRows,
  dayStillAhead,
  deriveClientHomeState,
  enquirySeries,
  enquiryWindowStart,
  greetingFor,
  homeLayoutOf,
  homeLede,
  kickoffIsOver,
  kickoffSteps,
  LAUNCH_GREETING_DAYS,
  finishedDeliverableRows,
  finishedRequestRows,
  needsYou,
  overviewLede,
  roundsIncludedLine,
  stillAhead,
  websiteCopy,
  websiteMilestones,
  type ClientHomeState,
  type HomeFacts,
} from "./rules";

// Ported from apps/platform lib/home/state.test.ts, due.test.ts and milestones.test.ts, adapted to plan 61's layouts.

const NOW = new Date("2026-10-30T12:00:00.000Z");
const at = (iso: string): Date => new Date(iso);
const FUTURE = { startsAt: at("2026-10-31T06:00:00Z"), endsAt: at("2026-10-31T06:30:00Z"), heldAt: null };
const OVER = { startsAt: at("2026-10-30T10:00:00Z"), endsAt: at("2026-10-30T10:30:00Z"), heldAt: null };
const HELD = { ...OVER, heldAt: at("2026-10-30T10:35:00Z") };

function facts(overrides: Partial<HomeFacts> = {}): HomeFacts {
  return { now: NOW, billing: { status: "paid", paymentUnderReview: false }, services: ["website", "social"], kickoff: null, missedKickoffAt: null, project: null, live: null, ...overrides };
}
const kind = (overrides: Partial<HomeFacts>) => deriveClientHomeState(facts(overrides)).kind;
const project = (status: NonNullable<HomeFacts["project"]>["status"], extra: Partial<NonNullable<HomeFacts["project"]>> = {}) => ({ project: { status, slaDueAt: null, onHoldReason: null, ...extra } });

describe("a payment problem comes first", () => {
  it("is payment required until the first payment, or processing while it is under review", () => {
    expect(kind({ billing: { status: "unpaid", paymentUnderReview: false } })).toBe("payment_required");
    expect(kind({ billing: { status: "unpaid", paymentUnderReview: true } })).toBe("payment_processing");
  });

  it("is lapsed for a plan that has ended, whatever the project says", () => {
    expect(kind({ billing: { status: "lapsed", paymentUnderReview: false }, kickoff: OVER, ...project("building") })).toBe("lapsed");
  });
});

describe("before the kickoff is over", () => {
  it("asks for a booking when there is none", () => {
    expect(kind({})).toBe("kickoff_unbooked");
  });

  it("shows a booking that is still ahead, or under way, with its times", () => {
    expect(deriveClientHomeState(facts({ kickoff: FUTURE }))).toEqual({ kind: "kickoff_booked", startsAt: FUTURE.startsAt, endsAt: FUTURE.endsAt });
    expect(kind({ kickoff: { startsAt: at("2026-10-30T11:45:00Z"), endsAt: at("2026-10-30T12:15:00Z"), heldAt: null } })).toBe("kickoff_booked");
  });

  it("keeps a booking the booking page gave no time for as booked, not unbooked", () => {
    expect(deriveClientHomeState(facts({ kickoff: { startsAt: null, endsAt: null, heldAt: null } }))).toEqual({ kind: "kickoff_booked", startsAt: null, endsAt: null });
  });
});

describe("kickoffIsOver", () => {
  it("is over when staff marked it held, or its end time has passed, and not before", () => {
    expect(kickoffIsOver(null, NOW)).toBe(false);
    expect(kickoffIsOver(FUTURE, NOW)).toBe(false);
    expect(kickoffIsOver(OVER, NOW)).toBe(true);
    expect(kickoffIsOver({ startsAt: null, endsAt: null, heldAt: NOW }, NOW)).toBe(true);
    expect(kickoffIsOver({ startsAt: OVER.startsAt, endsAt: NOW, heldAt: null }, NOW)).toBe(true);
    // A booking with no end time never ends until staff mark it.
    expect(kickoffIsOver({ startsAt: OVER.startsAt, endsAt: null, heldAt: null }, NOW)).toBe(false);
  });
});

describe("after the kickoff, for a website customer", () => {
  const over = { kickoff: OVER };

  it("is starting once staff marked the call held while the project waits in onboarding, and building once it has moved", () => {
    expect(kind({ kickoff: HELD, ...project("onboarding") })).toBe("starting");
    expect(kind({ ...over, ...project("building") })).toBe("building");
  });

  it("is preparing from the send until staff press Start, with the same due date as building", () => {
    expect(deriveClientHomeState(facts({ ...over, ...project("submitted", { slaDueAt: at("2026-11-01T10:00:00Z") }) }))).toEqual({ kind: "preparing", dueAt: at("2026-11-01T10:00:00Z") });
    expect(deriveClientHomeState(facts({ ...over, ...project("building", { slaDueAt: at("2026-11-01T10:00:00Z") }) }))).toEqual({ kind: "building", dueAt: at("2026-11-01T10:00:00Z") });
  });

  it("shows the hold reason exactly as staff wrote it", () => {
    expect(deriveClientHomeState(facts({ ...over, ...project("on_hold", { onHoldReason: "Waiting for your logo file" }) }))).toEqual({ kind: "on_hold", reason: "Waiting for your logo file" });
  });

  it("follows the project through review, changes and approval", () => {
    expect(kind({ ...over, ...project("preview") })).toBe("preview_ready");
    expect(kind({ ...over, ...project("revisions") })).toBe("revisions");
    expect(kind({ ...over, ...project("approved") })).toBe("approved");
  });

  it("greets a new site for a week, then goes ongoing", () => {
    expect(deriveClientHomeState(facts({ ...over, live: { hostname: "sharma.in", launchedAt: at("2026-10-28T09:00:00Z") } }))).toEqual({ kind: "launched", hostname: "sharma.in" });
    const old = new Date(NOW.getTime() - (LAUNCH_GREETING_DAYS + 1) * 86_400_000);
    expect(kind({ ...over, live: { hostname: "sharma.in", launchedAt: old } })).toBe("ongoing");
    expect(kind({ ...over, live: { hostname: "sharma.in", launchedAt: null } })).toBe("ongoing");
  });

  it("is ongoing when there is no project (cancelled, or none)", () => {
    expect(kind({ ...over })).toBe("ongoing");
    expect(kind({ ...over, ...project("cancelled") })).toBe("ongoing");
  });
});

describe("a call that ended and nobody has marked", () => {
  it("claims nothing: it is unconfirmed, with the time the call was due, while the project waits in onboarding", () => {
    expect(deriveClientHomeState(facts({ kickoff: OVER, ...project("onboarding") }))).toEqual({ kind: "kickoff_unconfirmed", callAt: OVER.startsAt });
  });

  it("falls back to the end time when the start was never reported", () => {
    expect(deriveClientHomeState(facts({ kickoff: { ...OVER, startsAt: null }, ...project("onboarding") }))).toEqual({ kind: "kickoff_unconfirmed", callAt: OVER.endsAt });
  });

  it("is not unconfirmed once staff marked it held, once the build started, or for a plan without the website", () => {
    expect(kind({ kickoff: HELD, ...project("onboarding") })).toBe("starting");
    expect(kind({ kickoff: OVER, ...project("submitted") })).toBe("preparing");
    expect(kind({ kickoff: OVER, ...project("building") })).toBe("building");
    expect(kind({ services: ["social"], kickoff: OVER, ...project("onboarding") })).toBe("ongoing");
  });

  it("does not hide a booking still ahead or under way", () => {
    expect(kind({ kickoff: FUTURE, ...project("onboarding") })).toBe("kickoff_booked");
  });
});

describe("a call staff marked as missed", () => {
  const MISSED = at("2026-10-29T09:15:00Z");

  it("asks for a booking again, and carries the time that was missed, for a website customer", () => {
    expect(deriveClientHomeState(facts({ missedKickoffAt: MISSED, ...project("onboarding") }))).toEqual({ kind: "kickoff_unbooked", missedAt: MISSED });
  });

  it("says nothing about a miss for a plan without the website, or when none was missed", () => {
    expect(deriveClientHomeState(facts({ services: ["social"], missedKickoffAt: MISSED }))).toEqual({ kind: "kickoff_unbooked", missedAt: null });
    expect(deriveClientHomeState(facts({}))).toEqual({ kind: "kickoff_unbooked", missedAt: null });
  });

  it("is replaced by the booking as soon as the customer books again", () => {
    expect(kind({ missedKickoffAt: MISSED, kickoff: FUTURE })).toBe("kickoff_booked");
  });

  it("never shows a miss to an account with a payment problem", () => {
    expect(kind({ billing: { status: "unpaid", paymentUnderReview: false }, missedKickoffAt: MISSED })).toBe("payment_required");
  });
});

describe("a plan without the website", () => {
  it("goes straight to ongoing once the kickoff is over, and never shows build states", () => {
    expect(kind({ services: ["social"], kickoff: OVER })).toBe("ongoing");
    expect(kind({ services: ["search"], kickoff: OVER, ...project("onboarding") })).toBe("ongoing");
    expect(kind({ services: ["social"], kickoff: FUTURE })).toBe("kickoff_booked");
  });
});

describe("homeLayoutOf", () => {
  it("draws every state in one of plan 61's four layouts", () => {
    const states: readonly [ClientHomeState, string][] = [
      [{ kind: "payment_required" }, "task"],
      [{ kind: "payment_processing" }, "task"],
      [{ kind: "lapsed" }, "task"],
      [{ kind: "kickoff_unbooked", missedAt: null }, "task"],
      [{ kind: "kickoff_booked", startsAt: null, endsAt: null }, "task"],
      [{ kind: "kickoff_unconfirmed", callAt: NOW }, "task"],
      [{ kind: "starting" }, "progress"],
      [{ kind: "preparing", dueAt: null }, "progress"],
      [{ kind: "building", dueAt: null }, "progress"],
      [{ kind: "on_hold", reason: null }, "progress"],
      [{ kind: "approved" }, "progress"],
      [{ kind: "launched", hostname: "x.in" }, "progress"],
      [{ kind: "preview_ready" }, "review"],
      [{ kind: "revisions" }, "review"],
      [{ kind: "ongoing" }, "overview"],
    ];
    for (const [state, layout] of states) expect(homeLayoutOf(state), state.kind).toBe(layout);
  });
});

describe("promised dates", () => {
  const NOW_2 = new Date("2026-11-02T04:00:00Z");

  it("keeps a date that has not come yet, and drops one that has passed or is exactly now", () => {
    const due = new Date("2026-11-03T04:00:00Z");
    expect(stillAhead(due, NOW_2)).toBe(due);
    expect(stillAhead(new Date("2026-10-31T05:00:00Z"), NOW_2)).toBeNull();
    expect(stillAhead(NOW_2, NOW_2)).toBeNull();
    expect(stillAhead(null, NOW_2)).toBeNull();
  });

  it("keeps today and later days, in India's time", () => {
    expect(dayStillAhead("2026-11-02", NOW_2)).toBe("2026-11-02");
    expect(dayStillAhead("2026-11-09", NOW_2)).toBe("2026-11-09");
    // 20:00 UTC on the 2nd is already the 3rd in India.
    expect(dayStillAhead("2026-11-02", new Date("2026-11-02T20:00:00Z"))).toBeNull();
    expect(dayStillAhead("2026-11-01", NOW_2)).toBeNull();
    expect(dayStillAhead(null, NOW_2)).toBeNull();
  });
});

describe("websiteMilestones", () => {
  const input = { kickoffAt: new Date("2026-10-30T10:30:00Z"), firstPreviewDueAt: new Date("2026-11-01T10:30:00Z"), now: NOW };
  const states = (state: ClientHomeState) => websiteMilestones(state, input).map((item) => item.state);

  it("has the kickoff done and the building now while the website is built, with the stored preview date", () => {
    const items = websiteMilestones({ kind: "building", dueAt: input.firstPreviewDueAt }, input);
    expect(items.map((item) => item.label)).toEqual(["Kickoff", "Building", "Your review", "Changes", "Live"]);
    expect(items.map((item) => item.state)).toEqual(["done", "now", "todo", "todo", "todo"]);
    expect(items[0]?.note).toBe("Fri 30 Oct");
    expect(items[1]?.note).toBe("Preview by Sun 1 Nov");
  });

  it("does not show building as now while staff have not said the kickoff happened", () => {
    const items = websiteMilestones({ kind: "kickoff_unconfirmed", callAt: input.kickoffAt }, input);
    expect(items.map((item) => item.state)).toEqual(["now", "todo", "todo", "todo", "todo"]);
    expect(items.some((item) => item.note?.startsWith("Preview by"))).toBe(false);
  });

  it("leaves a date out when none is stored, and does not guess one", () => {
    const items = websiteMilestones({ kind: "starting" }, { kickoffAt: null, firstPreviewDueAt: null, now: NOW });
    expect(items[0]?.note).toBeNull();
    expect(items[1]?.note).toBe("Now");
  });

  it("moves on through review, changes and approval, and says a paused build is paused", () => {
    expect(states({ kind: "preview_ready" })).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(states({ kind: "revisions" })).toEqual(["done", "done", "done", "now", "todo"]);
    expect(states({ kind: "approved" })).toEqual(["done", "done", "done", "done", "now"]);
    expect(websiteMilestones({ kind: "on_hold", reason: "x" }, input)[1]).toMatchObject({ state: "now", note: "Paused" });
  });

  it("shows the day staff plan to go live, once they set one", () => {
    const planned = { ...input, launchPlannedOn: "2026-11-05" };
    expect(websiteMilestones({ kind: "approved" }, planned)[4]?.note).toBe("Planned for Thu 5 Nov");
    expect(websiteMilestones({ kind: "building", dueAt: null }, input)[4]?.note).toBeNull();
    expect(websiteMilestones({ kind: "approved" }, input)[4]?.note).toBe("Launch next");
  });
});

describe("words", () => {
  it("greets by the hour in India", () => {
    expect(greetingFor(new Date("2026-10-30T03:00:00Z"))).toBe("Good morning"); // 08:30
    expect(greetingFor(new Date("2026-10-30T08:00:00Z"))).toBe("Good afternoon"); // 13:30
    expect(greetingFor(new Date("2026-10-30T12:00:00Z"))).toBe("Good evening"); // 17:30
  });

  it("names the day and the active services", () => {
    expect(homeLede(["website", "social"], NOW)).toBe("Fri 30 Oct. Your Website and Social & Ads services are active.");
    expect(homeLede(["search"], NOW)).toBe("Fri 30 Oct. Your Local SEO + AEO service is active.");
    expect(homeLede([], NOW)).toBe("Fri 30 Oct.");
  });

  it("says a promised preview date only while there is one", () => {
    expect(websiteCopy({ kind: "building", dueAt: null }, NOW).text).toBe("We will email you, and show it here, when your first preview is ready.");
    expect(websiteCopy({ kind: "building", dueAt: at("2026-11-01T10:00:00Z") }, NOW).text).toContain("Sun 1 Nov, 15:30");
    expect(websiteCopy({ kind: "on_hold", reason: null }, NOW).text).toBe("We will tell you here when it starts again.");
  });

  it("uses the required kickoff wording before and after call confirmation", () => {
    expect(websiteCopy({ kind: "kickoff_unconfirmed", callAt: at("2026-11-01T10:00:00Z") }, NOW)).toEqual({
      title: "We will start your website right after your call",
      text: "We will start your website right after your call. If you could not join, you can book a new time.",
    });
    expect(websiteCopy({ kind: "starting" }, NOW)).toEqual({
      title: "Thanks for the call. We are getting your website started",
      text: "Your kickoff call is completed. The date of your first preview appears here as soon as the build starts.",
    });
  });
});

describe("kickoffSteps", () => {
  it("promises without dates until the call has a time, then dates both promises from it", () => {
    expect(kickoffSteps({ hasWebsite: true, callStart: null, held: false, now: NOW }).map((step) => step.meta)).toEqual([
      "The time you pick",
      "Within 48 hours of the call",
      "Approve it or ask for changes",
      "Within 7 working days of the call",
    ]);
    // Tue 3 Nov 11:00 in India: start by Thu 5 Nov, live by 7 working days later (weekends skipped): Thu 12 Nov.
    const booked = kickoffSteps({ hasWebsite: true, callStart: at("2026-11-03T05:30:00Z"), held: false, now: NOW });
    expect(booked.map((step) => step.meta)).toEqual(["Tue 3 Nov, 11:00", "By Thu 5 Nov", "Approve it or ask for changes", "By Thu 12 Nov"]);
  });

  it("has two steps for a plan without the website", () => {
    expect(kickoffSteps({ hasWebsite: false, callStart: null, held: false, now: NOW }).map((step) => step.title)).toEqual(["Kickoff call", "We start work"]);
  });
});

describe("needsYou", () => {
  const need = (overrides: Partial<RequestNeed>): RequestNeed => ({ ticketId: "t1", subject: "New page", kind: "website", state: "quoted", acceptedAt: null, quote: null, ...overrides }) as RequestNeed;
  const waiting = (ticketId: string, subject: string): WaitingOnYou => ({ ticketId, subject }) as WaitingOnYou;
  const item = (key: string, done = false) => ({ key, label: key, service: "social" as const, done, href: `/checklist?item=${key}` });

  it("lists posts first, then quotes and checks, then replies, then the blocking setup questions", () => {
    const rows = needsYou({
      posts: { count: 4, by: "Tue 1 Dec" },
      needs: [need({ ticketId: "q" }), need({ ticketId: "c", state: "preview", subject: "Hours" })],
      waiting: [waiting("q", "New page"), waiting("r", "Logo colours")],
      checklist: [item("accounts"), item("offers"), item("brand"), item("budget", true)],
    });
    expect(rows.map((row) => row.key)).toEqual(["posts", "request-q", "request-c", "request-r", "setup-accounts"]);
    expect(rows.map((row) => row.action)).toEqual(["Review", "Review", "Review", "Reply", "Add"]);
    expect(rows[0]).toMatchObject({ label: "Approve 4 posts", hint: "By Tue 1 Dec" });
  });

  it("says Pay for a quote already accepted, and leaves out posts when none wait", () => {
    const rows = needsYou({ posts: { count: 0, by: null }, needs: [need({ acceptedAt: NOW })], waiting: [], checklist: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("Pay");
  });
});

describe("a failing renewal", () => {
  const failing = { until: "Sat 7 Nov" };

  it("is the first thing that needs the customer, with the way to fix it", () => {
    const rows = needsYou({ posts: { count: 2, by: "Tue 1 Dec" }, needs: [], waiting: [], checklist: [], renewalFailing: failing });
    expect(rows.map((row) => row.key)).toEqual(["billing", "posts"]);
    expect(rows[0]).toMatchObject({ action: "Change payment method", href: "/billing/payment", hint: "We will try again. Your website stays online until Sat 7 Nov." });
  });

  it("adds nothing while payments are fine", () => {
    expect(needsYou({ posts: { count: 0, by: null }, needs: [], waiting: [], checklist: [], renewalFailing: null })).toEqual([]);
  });

  it("does not let the line under the greeting say everything is running", () => {
    expect(overviewLede([])).toBe("Everything is running. Nothing needs you right now.");
    expect(overviewLede([{ key: "posts" }, { key: "request-1" }])).toBe("Everything is running. 2 things need you.");
    expect(overviewLede([{ key: "posts" }])).toBe("Everything is running. 1 thing needs you.");
    expect(overviewLede([{ key: "billing" }])).toBe("1 thing needs you.");
    expect(overviewLede([{ key: "billing" }, { key: "posts" }])).toBe("2 things need you.");
  });
});

describe("roundsIncludedLine", () => {
  it("states what the plan includes, so it agrees with the count of rounds used", () => {
    expect(roundsIncludedLine(2, 1)).toBe("2 rounds of changes are included.");
    expect(roundsIncludedLine(1, 0)).toBe("1 round of changes is included.");
  });

  it("says what happens next once every round is used", () => {
    expect(roundsIncludedLine(2, 2)).toBe("Further changes are quoted first.");
  });
});

describe("what we did from finished work", () => {
  const row = (kind: "post" | "page" | "listing", status: string, publishedAt: Date | null) => ({ id: kind, kind, title: `The ${kind}`, status, publishedAt });

  it("lists published posts, improved pages and fixed listings, and leaves out anything not published", () => {
    const rows = finishedDeliverableRows([
      row("post", "published", at("2026-10-29T10:00:00Z")),
      row("page", "published", at("2026-10-28T10:00:00Z")),
      row("listing", "published", at("2026-10-27T10:00:00Z")),
      { ...row("post", "planned", null), id: "later" },
    ]);
    expect(rows).toEqual([
      { key: "deliverable-post", at: at("2026-10-29T10:00:00Z"), label: "Published a post: The post", service: "social" },
      { key: "deliverable-page", at: at("2026-10-28T10:00:00Z"), label: "Improved a page: The page", service: "search" },
      { key: "deliverable-listing", at: at("2026-10-27T10:00:00Z"), label: "Fixed a listing: The listing", service: "search" },
    ]);
  });

  it("lists only the requests that are done", () => {
    const request = (ticketId: string, word: string) => ({ ticketId, title: `Request ${ticketId}`, word, service: "website" as const, lastActivityAt: at("2026-10-26T10:00:00Z") });
    expect(finishedRequestRows([request("a", "Done"), request("b", "In progress")])).toEqual([
      { key: "request-a", at: at("2026-10-26T10:00:00Z"), label: "Finished your request: Request a", service: "website" },
    ]);
  });

  it("merges them with staff updates, newest first", () => {
    const rows = activityRows({
      events: [{ id: "e1", occurredAt: at("2026-10-20T10:00:00Z"), title: "Fixed the phone number", service: "search" }],
      previewSentAt: null,
      launchedAt: at("2026-10-01T10:00:00Z"),
      hostname: null,
      finished: finishedDeliverableRows([row("post", "published", at("2026-10-29T10:00:00Z"))]),
      limit: 6,
    });
    expect(rows.map((entry) => entry.key)).toEqual(["deliverable-post", "e1", "launched"]);
  });
});

describe("activityRows", () => {
  it("merges staff updates with the preview and the launch, newest first, cut to the limit", () => {
    const rows = activityRows({
      events: [
        { id: "e1", occurredAt: at("2026-10-20T10:00:00Z"), title: "Published 3 posts", service: "social" },
        { id: "e2", occurredAt: at("2026-10-25T10:00:00Z"), title: "Fixed the phone number", service: "search" },
      ],
      previewSentAt: at("2026-10-22T10:00:00Z"),
      launchedAt: at("2026-10-28T10:00:00Z"),
      hostname: "sharma.in",
      limit: 3,
    });
    expect(rows.map((row) => row.key)).toEqual(["launched", "e2", "preview"]);
    expect(rows[0]?.label).toBe("Your website went live on sharma.in");
  });
});

describe("enquirySeries", () => {
  it("counts by India day for the last 30 days and the 30 before, today included", () => {
    const series = enquirySeries(
      [
        at("2026-10-30T18:45:00Z"), // 31 Oct 00:15 in India: tomorrow, not counted
        at("2026-10-30T10:00:00Z"), // today
        at("2026-10-30T09:00:00Z"), // today
        at("2026-09-30T10:00:00Z"), // 30 days before today: the window before
        at("2026-08-31T10:00:00Z"), // older than both
      ],
      NOW,
    );
    expect(series.labels).toHaveLength(30);
    expect(series.labels[29]).toBe("Fri 30 Oct");
    expect(series.current[29]).toBe(2);
    expect(series.currentTotal).toBe(2);
    expect(series.previousTotal).toBe(1);
  });

  it("starts the read at the first moment of the earlier window, in India", () => {
    expect(enquiryWindowStart(NOW).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });
});
