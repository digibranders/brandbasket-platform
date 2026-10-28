import { describe, expect, it } from "vitest";
import type { BillingState } from "@brandbasket/db";
import { lapseReason, websitePausedAlert } from "./site-hosting-alert";

const NOW = new Date("2026-10-28T10:00:00Z");
const PAST = new Date("2026-10-20T00:00:00Z");
const FUTURE = new Date("2026-11-20T00:00:00Z");

type Sub = NonNullable<BillingState["subscription"]>;
const sub = (status: Sub["status"], paidThroughAt: Date | null): BillingState["subscription"] => ({ status, paidThroughAt }) as Sub;

describe("lapseReason", () => {
  it("names a missing subscription", () => {
    expect(lapseReason(null, NOW)).toBe("The business has no subscription.");
  });

  it("says the provider gave up on a stopped plan, whatever the date", () => {
    expect(lapseReason(sub("inactive", FUTURE), NOW)).toBe("The payment provider stopped retrying the payment.");
  });

  it("says a first payment never came", () => {
    expect(lapseReason(sub("incomplete", null), NOW)).toBe("The first payment was never made.");
  });

  it("gives the date the paid period ended when the next payment did not arrive", () => {
    expect(lapseReason(sub("past_due", PAST), NOW)).toBe("The paid period ended on 20 October 2026 and the next payment did not arrive.");
  });

  it("says a cancelled plan ran out", () => {
    expect(lapseReason(sub("cancelled", PAST), NOW)).toBe("The plan was cancelled and the paid period ended on 20 October 2026.");
  });

  it("falls back to the missing service when the period is still paid", () => {
    expect(lapseReason(sub("active", FUTURE), NOW)).toBe("The plan no longer includes the Managed Website service.");
  });
});

describe("websitePausedAlert", () => {
  const state = {
    subscription: sub("past_due", PAST),
    plan: { name: "Managed Website", recurringAmountCents: 299_900, currency: "INR" },
  } as unknown as BillingState;

  it("lists the plan, status, paid-until date, reason, time, project and what is done at the host", () => {
    const { facts, text } = websitePausedAlert({ state, site: { vercelProjectId: "prj_abc", vercelTeamId: "team_xyz", hostPause: true }, pausedAt: NOW });
    const byName = Object.fromEntries(facts.map((fact) => [fact.name, fact.value]));
    expect(byName["Plan"]).toContain("Managed Website");
    expect(byName["Plan status"]).toBe("Payment failing");
    expect(byName["Paid until"]).toContain("2026");
    expect(byName["Why"]).toContain("next payment did not arrive");
    expect(byName["Paused at"]).toContain("2026");
    expect(byName["Hosting project"]).toBe("prj_abc (team_xyz)");
    expect(byName["At the host"]).toBe("Paused on Vercel");
    expect(text).toContain("paused on Vercel");
    expect(text).toContain("comes back on its own");
  });

  it("says the website shows its own page when the host is left running", () => {
    const { text } = websitePausedAlert({ state: null, site: { vercelProjectId: "prj_abc", vercelTeamId: null, hostPause: false }, pausedAt: NOW });
    expect(text).toContain("maintenance page");
    expect(text).not.toContain("Vercel");
  });

  it("still reports when the billing state could not be read", () => {
    const { facts } = websitePausedAlert({ state: null, site: { vercelProjectId: "prj_abc", vercelTeamId: null, hostPause: false }, pausedAt: NOW });
    const byName = Object.fromEntries(facts.map((fact) => [fact.name, fact.value]));
    expect(byName["Plan status"]).toBe("No subscription");
    expect(byName["Hosting project"]).toBe("prj_abc");
    expect(byName["At the host"]).toContain("maintenance page");
    expect(byName["Plan"]).toBeNull();
  });
});
