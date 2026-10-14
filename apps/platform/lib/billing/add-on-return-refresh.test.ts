import { describe, expect, it } from "vitest";
import type { AddOnView } from "@fynix/shared/lib/billing/add-on-state";
import { isAwaitingReturnWebhook, RETURN_REFRESH_DELAYS_MS, type ReturnRefreshEntry } from "./add-on-return-refresh";

const DATE = new Date("2026-11-12T04:30:00Z");

function ready(addOn: "local-seo" | "performance-marketing", view: AddOnView): ReturnRefreshEntry {
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
      expect(isAwaitingReturnWebhook("kept", "local-seo", [ready("local-seo", view)], 0)).toBe(true);
    }
  });

  it("stops waiting on a Keep it once its add-on is active again", () => {
    expect(isAwaitingReturnWebhook("kept", "local-seo", [ready("local-seo", ACTIVE)], 0)).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "local-seo", [ready("local-seo", { state: "starting", since: DATE })], 0)).toBe(false);
  });

  it("looks only at the add-on the Keep it names", () => {
    const entries = [ready("local-seo", ACTIVE), ready("performance-marketing", { state: "ending", endsOn: DATE })];
    expect(isAwaitingReturnWebhook("kept", "local-seo", entries, 0)).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "performance-marketing", entries, 0)).toBe(true);
  });

  it("does not wait on a Keep it that names no add-on, or one whose row is broken or missing", () => {
    expect(isAwaitingReturnWebhook("kept", null, [ready("local-seo", { state: "ending", endsOn: DATE })], 0)).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "local-seo", [{ kind: "broken", addOn: "local-seo" }], 0)).toBe(false);
    expect(isAwaitingReturnWebhook("kept", "local-seo", [], 0)).toBe(false);
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
      expect(isAwaitingReturnWebhook("received", null, [ready("local-seo", ACTIVE), ready("performance-marketing", view)], 1)).toBe(true);
    }
  });

  it("waits on a payment while no press release is listed, since it may be the press release that was bought", () => {
    expect(isAwaitingReturnWebhook("received", null, [ready("local-seo", ACTIVE), ready("performance-marketing", ACTIVE)], 0)).toBe(true);
  });

  it("stops waiting on a payment once every add-on is running or on its way and a press release is listed", () => {
    const entries = [ready("local-seo", ACTIVE), ready("performance-marketing", { state: "starting", since: DATE })];
    expect(isAwaitingReturnWebhook("received", null, entries, 1)).toBe(false);
  });

  it("never waits for any other notice", () => {
    for (const notice of ["failed", "review", "recorded", "confirming", "nothing-due"] as const) {
      expect(isAwaitingReturnWebhook(notice, null, [ready("local-seo", { state: "none" })], 0)).toBe(false);
    }
    expect(isAwaitingReturnWebhook(null, null, [ready("local-seo", { state: "none" })], 0)).toBe(false);
  });
});
