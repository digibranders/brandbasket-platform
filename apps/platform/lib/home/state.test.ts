import { describe, expect, it } from "vitest";
import { deriveClientHomeState, homeLayoutOf, kickoffIsOver, LAUNCH_GREETING_DAYS, type HomeFacts } from "@/lib/home/state";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const at = (iso: string): Date => new Date(iso);
const FUTURE = { startsAt: at("2026-10-31T06:00:00Z"), endsAt: at("2026-10-31T06:30:00Z"), heldAt: null };
const OVER = { startsAt: at("2026-10-30T10:00:00Z"), endsAt: at("2026-10-30T10:30:00Z"), heldAt: null };

function facts(overrides: Partial<HomeFacts> = {}): HomeFacts {
  return { now: NOW, billing: { status: "paid", paymentUnderReview: false }, services: ["website", "social"], kickoff: null, project: null, live: null, ...overrides };
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
    const underWay = { startsAt: at("2026-10-30T11:45:00Z"), endsAt: at("2026-10-30T12:15:00Z"), heldAt: null };
    expect(kind({ kickoff: underWay })).toBe("kickoff_booked");
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
  });
});

describe("after the kickoff, for a website customer", () => {
  const over = { kickoff: OVER };

  it("is starting while the project waits in onboarding, and building once it has moved", () => {
    expect(kind({ ...over, ...project("onboarding") })).toBe("starting");
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
    const launchedAt = at("2026-10-28T09:00:00Z");
    expect(deriveClientHomeState(facts({ ...over, live: { hostname: "sharma.in", launchedAt } }))).toEqual({ kind: "launched", hostname: "sharma.in" });
    const old = new Date(NOW.getTime() - (LAUNCH_GREETING_DAYS + 1) * 86_400_000);
    expect(kind({ ...over, live: { hostname: "sharma.in", launchedAt: old } })).toBe("ongoing");
    expect(kind({ ...over, live: { hostname: "sharma.in", launchedAt: null } })).toBe("ongoing");
  });

  it("is ongoing when there is no project (cancelled, or none)", () => {
    expect(kind({ ...over })).toBe("ongoing");
    expect(kind({ ...over, ...project("cancelled") })).toBe("ongoing");
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
  it("draws every state in one of four layouts, plus billing", () => {
    const layouts = {
      payment_required: "billing",
      kickoff_unbooked: "kickoff",
      kickoff_booked: "kickoff",
      starting: "progress",
      preparing: "progress",
      building: "progress",
      on_hold: "progress",
      revisions: "progress",
      approved: "progress",
      preview_ready: "review",
      ongoing: "ongoing",
    } as const;
    for (const [stateKind, layout] of Object.entries(layouts)) {
      expect(homeLayoutOf({ kind: stateKind, startsAt: null, endsAt: null, dueAt: null, reason: null } as never), stateKind).toBe(layout);
    }
    expect(homeLayoutOf({ kind: "launched", hostname: "x.in" })).toBe("ongoing");
    expect(homeLayoutOf({ kind: "lapsed" })).toBe("billing");
    expect(homeLayoutOf({ kind: "payment_processing" })).toBe("billing");
  });
});
