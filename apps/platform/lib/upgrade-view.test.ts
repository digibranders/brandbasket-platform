import { describe, expect, it } from "vitest";
import type { UpgradeAssessment } from "@brandbasket/shared/server/plan-upgrade";
import { BLOCK_MESSAGES, daysLeftPhrase, PAYMENT_NOTICES, readPaymentNotice, UNAVAILABLE_MESSAGES, upgradeScreen, upgradeStanding } from "./upgrade-view";

describe("the Upgrade page's words", () => {
  it("has a message for every reason a client cannot move up on their own, each pointing somewhere", () => {
    expect(Object.keys(BLOCK_MESSAGES).sort()).toEqual(["ending", "lapsed", "manual-billing", "payment-failing", "under-review", "unpaid"]);
    for (const text of Object.values(BLOCK_MESSAGES)) expect(text.length).toBeGreaterThan(20);
  });

  it("has a message for every reason an upgrade cannot be offered", () => {
    expect(Object.keys(UNAVAILABLE_MESSAGES).sort()).toEqual([
      "different-currency",
      "different-tax",
      "no-premium-plan",
      "not-an-upgrade",
      "provider-not-ready",
      "renewal-due",
    ]);
  });

  it("reads the payment notices the return address names, and nothing else", () => {
    for (const key of Object.keys(PAYMENT_NOTICES)) expect(readPaymentNotice(key)).toBe(key);
    expect(readPaymentNotice("paid")).toBe("paid");
    expect(readPaymentNotice("hacked")).toBeNull();
    expect(readPaymentNotice(["paid"])).toBeNull();
    expect(readPaymentNotice(undefined)).toBeNull();
    expect(readPaymentNotice("toString")).toBeNull();
  });

  it("says days left in the singular for one", () => {
    expect(daysLeftPhrase(1)).toBe("1 day left");
    expect(daysLeftPhrase(20)).toBe("20 days left");
  });
});

describe("upgradeScreen", () => {
  const OFFER = { kind: "offer" } as unknown as UpgradeAssessment;
  const blocked = (reason: string): UpgradeAssessment => ({ kind: "blocked", reason }) as UpgradeAssessment;

  it("sends a client who is already Premium to their dashboard", () => {
    expect(upgradeScreen({ assessment: blocked("already-premium"), inFlightStatus: null, notice: null })).toEqual({ kind: "home" });
  });

  it("says a paid move is waiting, and whether the provider has still to be told", () => {
    expect(upgradeScreen({ assessment: blocked("already-moving"), inFlightStatus: "paid", notice: "paid" })).toEqual({ kind: "moving", finishing: true });
    expect(upgradeScreen({ assessment: blocked("already-moving"), inFlightStatus: "scheduled", notice: null })).toEqual({ kind: "moving", finishing: false });
  });

  it("shows the reason for every block that is not Premium already", () => {
    for (const reason of Object.keys(BLOCK_MESSAGES)) {
      expect(upgradeScreen({ assessment: blocked(reason), inFlightStatus: null, notice: null })).toEqual({ kind: "blocked", reason });
    }
  });

  it("shows why an offer cannot be made", () => {
    for (const reason of Object.keys(UNAVAILABLE_MESSAGES)) {
      const assessment = { kind: "unavailable", reason } as UpgradeAssessment;
      expect(upgradeScreen({ assessment, inFlightStatus: null, notice: null })).toEqual({ kind: "unavailable", reason });
    }
  });

  it("holds the Pay button back only while the payment just made is still being confirmed against an open charge", () => {
    expect(upgradeScreen({ assessment: OFFER, inFlightStatus: "open", notice: "processing" })).toEqual({ kind: "offer", waiting: true });
    // No charge open: the payment already settled, or never began, so there is nothing to wait for.
    expect(upgradeScreen({ assessment: OFFER, inFlightStatus: null, notice: "processing" })).toEqual({ kind: "offer", waiting: false });
    // An open charge but they did not just pay: they may pay it.
    expect(upgradeScreen({ assessment: OFFER, inFlightStatus: "open", notice: null })).toEqual({ kind: "offer", waiting: false });
    expect(upgradeScreen({ assessment: OFFER, inFlightStatus: "open", notice: "failed" })).toEqual({ kind: "offer", waiting: false });
    expect(upgradeScreen({ assessment: OFFER, inFlightStatus: "open", notice: "stale" })).toEqual({ kind: "offer", waiting: false });
  });
});

describe("upgradeStanding", () => {
  it("is Premium for a customer whose move up is paid and waiting for the renewal, Care for everyone else the page shows", () => {
    expect(upgradeStanding({ kind: "moving", finishing: false })).toEqual({ yours: "premium" });
    expect(upgradeStanding({ kind: "moving", finishing: true })).toEqual({ yours: "premium" });
    expect(upgradeStanding({ kind: "offer", waiting: false })).toEqual({ yours: "care" });
    expect(upgradeStanding({ kind: "blocked", reason: "ending" })).toEqual({ yours: "care" });
    expect(upgradeStanding({ kind: "unavailable", reason: "no-premium-plan" })).toEqual({ yours: "care" });
  });
});
