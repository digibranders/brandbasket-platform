import type { ClientProject, SetupCallBooking } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { clientExceptions, type ExceptionFacts, type Read } from "./client-exceptions";

const NOW = new Date("2026-11-20T09:00:00.000Z");
const DAY = 86_400_000;
const ok = <T,>(value: T): Read<T> => ({ ok: true, value });

function project(overrides: Partial<ClientProject> = {}): ClientProject {
  return {
    id: "p1",
    status: "building",
    onboardingSubmittedAt: null,
    slaDueAt: null,
    previewUrl: null,
    previewSentAt: null,
    revisionRoundsGranted: 1,
    launchedAt: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

function facts(overrides: Partial<ExceptionFacts> = {}): ExceptionFacts {
  return {
    now: NOW,
    businessName: "Harbour Bakery",
    project: project(),
    movingTo: null,
    domainStatus: null,
    subscriptionStatus: "active",
    lapsed: false,
    booking: ok(null),
    flaggedPayments: ok(0),
    closure: ok(null),
    privacy: ok(null),
    ...overrides,
  };
}

const endedBooking = (hoursAgo: number, heldAt: Date | null = null): SetupCallBooking => ({ heldAt, endsAt: new Date(NOW.getTime() - hoursAgo * 3_600_000) }) as SetupCallBooking;

describe("clientExceptions", () => {
  it("is empty and fully read when nothing is wrong", () => {
    expect(clientExceptions(facts())).toEqual({ exceptions: [], unreadable: [] });
  });

  it("puts a failed renewal before a kickoff call nobody confirmed (ruling 11)", () => {
    const { exceptions } = clientExceptions(facts({ subscriptionStatus: "past_due", booking: ok(endedBooking(30)), project: project({ status: "onboarding" }) }));
    expect(exceptions.map((item) => item.key)).toEqual(["renewal", "kickoff"]);
  });

  it("keeps a late kickoff first when no payment failed", () => {
    const { exceptions } = clientExceptions(facts({ project: project({ status: "onboarding" }), booking: ok(endedBooking(26)) }));
    expect(exceptions[0]?.key).toBe("kickoff");
    expect(exceptions[0]?.clock).toBe("1d late");
    expect(exceptions[0]?.title).toBe("Did the kickoff call with Harbour Bakery happen?");
  });

  it("ignores a confirmed call, a call still ahead, and a project past onboarding", () => {
    expect(clientExceptions(facts({ booking: ok(endedBooking(30, NOW)), project: project({ status: "onboarding" }) })).exceptions).toEqual([]);
    expect(clientExceptions(facts({ booking: ok(endedBooking(-2)), project: project({ status: "onboarding" }) })).exceptions).toEqual([]);
    expect(clientExceptions(facts({ booking: ok(endedBooking(30)) })).exceptions).toEqual([]);
  });

  it("flags a first preview past its date, and a sent preview silent for 5 days (ruling 15)", () => {
    expect(clientExceptions(facts({ project: project({ slaDueAt: new Date(NOW.getTime() - DAY) }) })).exceptions[0]?.key).toBe("late-preview");
    const sent = (days: number): ClientProject => project({ status: "preview", previewSentAt: new Date(NOW.getTime() - days * DAY) });
    expect(clientExceptions(facts({ project: sent(4) })).exceptions).toEqual([]);
    expect(clientExceptions(facts({ project: sent(5) })).exceptions[0]).toMatchObject({ key: "silent-preview", late: false });
  });

  it("orders the rest as the plan lists them", () => {
    const { exceptions } = clientExceptions(
      facts({
        domainStatus: "misconfigured",
        movingTo: { hostname: "harbour.in" },
        flaggedPayments: ok(2),
        lapsed: true,
        closure: ok({ eraseAfter: new Date(NOW.getTime() + 10 * DAY) }),
        privacy: ok({ dueAt: new Date(NOW.getTime() - DAY) }),
      }),
    );
    expect(exceptions.map((item) => item.key)).toEqual(["address", "domain-move", "unapplied", "lapsed", "closing", "privacy"]);
    expect(exceptions.find((item) => item.key === "unapplied")?.text).toBe("2 payments need a look");
    expect(exceptions.find((item) => item.key === "privacy")?.late).toBe(true);
  });

  it("names every failed read and never turns it into an exception", () => {
    const failed = clientExceptions(facts({ booking: { ok: false }, flaggedPayments: { ok: false }, closure: { ok: false }, privacy: { ok: false } }));
    expect(failed.exceptions).toEqual([]);
    expect(failed.unreadable).toEqual(["the kickoff call", "payments", "the closing state", "privacy requests"]);
  });

  it("does not read payments for a role without money", () => {
    expect(clientExceptions(facts({ flaggedPayments: null })).unreadable).toEqual([]);
  });
});
