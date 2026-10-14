import { describe, expect, it } from "vitest";
import { PLAN_UPGRADE_NOTICES, planUpgradeNoticeHref, readPlanUpgradeNotice } from "./plan-upgrade-notices";
import { PAYMENT_ATTENTION_LABELS } from "./billing/attention";

describe("the client page's Plan notices", () => {
  it("reads the notices an address names, and nothing else", () => {
    for (const key of Object.keys(PLAN_UPGRADE_NOTICES)) expect(readPlanUpgradeNotice(key)).toBe(key);
    expect(readPlanUpgradeNotice("<script>")).toBeNull();
    expect(readPlanUpgradeNotice(["moved"])).toBeNull();
    expect(readPlanUpgradeNotice("toString")).toBeNull();
    expect(readPlanUpgradeNotice(undefined)).toBeNull();
  });

  it("scrolls to the Plan section", () => {
    expect(planUpgradeNoticeHref("abc", "moved")).toBe("/clients/abc?plan=moved#plan");
  });

  it("calls only a completed move or a finished provider step a success", () => {
    const ok = Object.entries(PLAN_UPGRADE_NOTICES).filter(([, notice]) => notice.ok).map(([key]) => key);
    expect(ok.sort()).toEqual(["finished", "moved"]);
  });
});

describe("attention labels for a move up", () => {
  it("tells staff what to do about a payment for a move that no longer applied, and one the provider was not told about", () => {
    expect(PAYMENT_ATTENTION_LABELS.upgrade_not_applied.action).toMatch(/Refund/);
    expect(PAYMENT_ATTENTION_LABELS.upgrade_provider_pending.action).toMatch(/Finish the move/);
  });
});
