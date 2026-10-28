import { describe, expect, it } from "vitest";
import { planHostingActions, type HostedSiteState } from "./hosting-plan";

function site(id: string, overrides: Partial<HostedSiteState> = {}): HostedSiteState {
  return {
    businessId: id,
    paused: false,
    hasLiveProject: true,
    billing: { hasWebsite: true, paymentUnderReview: false },
    ...overrides,
  };
}

const lapsed = { hasWebsite: false, paymentUnderReview: false } as const;

describe("planHostingActions", () => {
  it("does nothing for a paid site that is running", () => {
    expect(planHostingActions([site("a")])).toEqual({ actions: [], held: [], braked: false });
  });

  it("pauses a live site whose website has ended", () => {
    const plan = planHostingActions([site("a", { billing: lapsed })]);
    expect(plan.actions).toEqual([{ businessId: "a", action: "pause" }]);
    expect(plan.braked).toBe(false);
  });

  it("leaves an already paused, still lapsed site alone", () => {
    expect(planHostingActions([site("a", { paused: true, billing: lapsed })]).actions).toEqual([]);
  });

  it("unpauses a paused site once it has access again", () => {
    expect(planHostingActions([site("a", { paused: true })]).actions).toEqual([{ businessId: "a", action: "unpause" }]);
  });

  it("unpauses even while a payment is under review", () => {
    const billing = { hasWebsite: true, paymentUnderReview: true };
    expect(planHostingActions([site("a", { paused: true, billing })]).actions).toEqual([{ businessId: "a", action: "unpause" }]);
  });

  it("never pauses a site that was not launched", () => {
    const plan = planHostingActions([site("a", { hasLiveProject: false, billing: lapsed })]);
    expect(plan.actions).toEqual([]);
    expect(plan.held).toEqual([{ businessId: "a", reason: "not-launched" }]);
  });

  it("holds a lapsed site whose payment is under review", () => {
    const billing = { hasWebsite: false, paymentUnderReview: true };
    const plan = planHostingActions([site("a", { billing })]);
    expect(plan.actions).toEqual([]);
    expect(plan.held).toEqual([{ businessId: "a", reason: "payment-under-review" }]);
  });

  it("changes nothing for a site whose billing could not be read", () => {
    const plan = planHostingActions([site("a", { billing: null }), site("b", { paused: true, billing: null })]);
    expect(plan.actions).toEqual([]);
    expect(plan.held).toEqual([
      { businessId: "a", reason: "billing-unreadable" },
      { businessId: "b", reason: "billing-unreadable" },
    ]);
  });

  describe("the brake", () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => site(`s${i}`, { billing: lapsed }));

    it("lets a few lapses through in a small fleet", () => {
      const plan = planHostingActions(many(3));
      expect(plan.braked).toBe(false);
      expect(plan.actions).toHaveLength(3);
    });

    it("applies no pause when more than three lapse in a small fleet", () => {
      const plan = planHostingActions(many(4));
      expect(plan.braked).toBe(true);
      expect(plan.actions).toEqual([]);
    });

    it("stops at ten however large the fleet", () => {
      expect(planHostingActions(many(10).concat(Array.from({ length: 500 }, (_, i) => site(`ok${i}`)))).braked).toBe(false);
      expect(planHostingActions(many(11).concat(Array.from({ length: 500 }, (_, i) => site(`ok${i}`)))).braked).toBe(true);
    });

    it("allows five percent of a larger fleet", () => {
      const healthy = Array.from({ length: 100 }, (_, i) => site(`ok${i}`));
      // 106 live sites: five percent rounds up to 6.
      expect(planHostingActions(many(6).concat(healthy)).braked).toBe(false);
      expect(planHostingActions(many(7).concat(healthy)).braked).toBe(true);
    });

    it("still unpauses sites that paid when the brake trips", () => {
      const plan = planHostingActions([...many(4), site("paid", { paused: true })]);
      expect(plan.braked).toBe(true);
      expect(plan.actions).toEqual([{ businessId: "paid", action: "unpause" }]);
    });
  });
});
