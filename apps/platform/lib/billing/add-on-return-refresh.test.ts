import { describe, expect, it } from "vitest";
import type { AddOnView } from "@brandbasket/shared/lib/billing/add-on-state";
import { isAwaitingReturnWebhook, RETURN_REFRESH_DELAYS_MS, type ReturnRefreshEntry } from "./add-on-return-refresh";

const DATE = new Date("2026-11-12T04:30:00Z");

function ready(addOn: "social-media" | "advertising", view: AddOnView): ReturnRefreshEntry {
  return { kind: "ready", addOn, view };
}

const ACTIVE: AddOnView = { state: "active", renewsOn: DATE };

describe("RETURN_REFRESH_DELAYS_MS", () => {
  it("is two refreshes, about 3 and about 8 seconds after the return, and no more", () => {
    expect(RETURN_REFRESH_DELAYS_MS).toEqual([3000, 8000]);
  });
});

describe("isAwaitingReturnWebhook", () => {
  it("waits on a Keep it while its add-on still shows none, ended, ending or pausing", () => {
    for (const view of [{ state: "none" }, { state: "ended" }, { state: "ending", endsOn: DATE }, { state: "pausing", pausesOn: DATE }] as const) {
      expect(isAwaitingReturnWebhook("kept", "social-media", [ready("social-media", view)])).toBe(true);
    }
  });

  it("stops waiting on a Keep it once its add-on is active again", () => {
    expect(isAwaitingReturnWebhook("kept", "social-media", [ready("social-media", ACTIVE)])).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "social-media", [ready("social-media", { state: "starting", since: DATE })])).toBe(false);
  });

  it("looks only at the add-on the Keep it names", () => {
    const entries = [ready("social-media", ACTIVE), ready("advertising", { state: "ending", endsOn: DATE })];
    expect(isAwaitingReturnWebhook("kept", "social-media", entries)).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "advertising", entries)).toBe(true);
  });

  it("does not wait on a Keep it that names no add-on, or one whose row is broken or missing", () => {
    expect(isAwaitingReturnWebhook("kept", null, [ready("social-media", { state: "ending", endsOn: DATE })])).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "social-media", [{ kind: "broken", addOn: "social-media" }])).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "social-media", [])).toBe(false);
  });

  it("waits on a payment while an add-on has not yet moved on from none, ended, ending, pausing, paused or failed", () => {
    for (const view of [
      { state: "none" },
      { state: "ended" },
      { state: "ending", endsOn: DATE },
      { state: "pausing", pausesOn: DATE },
      { state: "paused", since: DATE },
      { state: "failed", payBy: DATE },
    ] as const) {
      expect(isAwaitingReturnWebhook("received", null, [ready("social-media", ACTIVE), ready("advertising", view)])).toBe(true);
    }
  });

  it("stops waiting on a payment once every add-on is running or on its way", () => {
    const entries = [ready("social-media", ACTIVE), ready("advertising", { state: "starting", since: DATE })];
    expect(isAwaitingReturnWebhook("received", null, entries)).toBe(false);
  });

  it("never waits for any other notice", () => {
    for (const notice of ["failed", "review", "recorded", "confirming", "nothing-due"] as const) {
      expect(isAwaitingReturnWebhook(notice, null, [ready("social-media", { state: "none" })])).toBe(false);
    }
    expect(isAwaitingReturnWebhook(null, null, [ready("social-media", { state: "none" })])).toBe(false);
  });
});
