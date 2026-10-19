// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@brandbasket/db";
import { CareUpgrade } from "@/components/panel/upgrade/care-upgrade";
import { BRAND } from "@/lib/brand";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import { readUpgradePage } from "@/lib/server/plan-upgrade";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/server/plan-upgrade", () => ({ readUpgradePage: vi.fn() }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: async () => (await import("@/lib/brand")).BRAND }));
vi.mock("@/lib/server/billing-details", () => ({ loadBillingDetailsView: vi.fn(async () => null) }));
vi.mock("@/app/app-host/(protected)/upgrade/actions", () => ({ startUpgrade: vi.fn() }));
vi.mock("@/components/panel/email-us", () => ({ EmailUs: () => "hello@brandbasket.in" }));
vi.mock("@/components/panel/billing/billing-details", () => ({ BillingDetails: () => null }));

/*
 * The Upgrade page after a Care customer has paid to move up: the subscription is still billed on the Care plan row (the
 * renewal moves it), but the customer is Premium. The page used to say "You are on the Care plan", mark the Care card as
 * their current plan and put Premium's price on it, while the sidebar and the lower text said Premium.
 */

function plan(overrides: Partial<Plan>): Plan {
  return {
    id: "plan", code: "x", name: "Premium", tier: "premium", currency: "INR", initialAmountCents: 999_900, initialTermMonths: 1,
    recurringAmountCents: 999_900, includedPublishesPerMonth: 0, extraPublishAmountCents: 30_000, includedChangeHours: 1, extraHourAmountCents: 142_500,
    includedBlogPosts: 100, blogPostBlockSize: 100, extraBlogPostsAmountCents: 47_500, providerPlanId: null, taxRateBasisPoints: 1_800, ...overrides,
  } as Plan;
}

const CARE = plan({ id: "care", code: "care-inr-2026-10", name: "Care", tier: "care", initialAmountCents: 299_900, recurringAmountCents: 299_900 });
const PREMIUM = plan({ id: "premium", code: "premium-inr-2026-10-9999" });

/** The customer as the billing state reads it once the move is paid: the plan and tier are Premium's. */
const MOVED = {
  tenant: { businessId: "biz", userId: "user" },
  billing: {
    tier: "premium",
    plan: PREMIUM,
    upgradePaid: true,
    subscription: { discountAmountCents: 0, paidThroughAt: new Date("2026-11-14T00:00:00.000Z") },
  },
} as unknown as GrantedCustomer;

const CARE_CLIENT = { tenant: MOVED.tenant, billing: { tier: "care", plan: CARE, upgradePaid: false, subscription: { discountAmountCents: 0, paidThroughAt: new Date("2026-11-14T00:00:00.000Z") } } } as unknown as GrantedCustomer;

async function render(customer: GrantedCustomer): Promise<string> {
  return renderToStaticMarkup(await CareUpgrade({ customer, payment: undefined }));
}

/** The markup of one card, from its heading to the next card. */
function card(html: string, tier: "care" | "premium"): string {
  const start = html.indexOf(`aria-labelledby="upgrade-plan-${tier}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("<section", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

beforeEach(() => vi.clearAllMocks());

describe("the Upgrade page for a Care customer whose move to Premium is paid and waiting for the renewal", () => {
  beforeEach(() => {
    vi.mocked(readUpgradePage).mockResolvedValue({
      assessment: { kind: "blocked", reason: "already-moving" },
      inFlight: null,
      billedPlan: CARE,
    });
  });

  it("says they are on Premium, not on Care", async () => {
    const html = await render(MOVED);
    expect(html).toContain("You’re on");
    expect(html).not.toContain("You are on the Care plan");
    expect(html).not.toContain("Move up to");
    expect(html).toContain("Your move up is paid for");
  });

  it("marks the Premium card as the current plan, at Premium's price, and not the Care card", async () => {
    const html = await render(MOVED);
    const premium = card(html, "premium");
    expect(premium).toContain("Your current plan");
    expect(premium).toContain("₹9,999");
    expect(premium).toContain("₹11,798.82");
    const care = card(html, "care");
    expect(care).not.toContain("Your current plan");
  });

  it("prices the Care card at Care's own price, never Premium's", async () => {
    const care = card(await render(MOVED), "care");
    expect(care).toContain("₹2,999");
    expect(care).not.toContain("₹9,999");
  });

  it("puts 'your plan' on Premium's column of the comparison", async () => {
    const html = await render(MOVED);
    expect(html).toMatch(/Premium<\/?[^>]*>[^<]*(<[^>]+>)*[^<]*Your plan/);
    expect(html).not.toMatch(/Care(<[^>]+>|\s|·)*Your plan/);
  });

  it("names Brandbasket and nothing of Brandbasket", async () => {
    const html = await render(MOVED);
    expect(BRAND.name).toBe("Brandbasket");
    expect(html).not.toMatch(/first\s?fold/i);
  });
});

describe("the Upgrade page for a Care customer who has not moved up", () => {
  it("is unchanged: they are on Care, with Care marked as theirs at Care's price", async () => {
    vi.mocked(readUpgradePage).mockResolvedValue({
      assessment: { kind: "blocked", reason: "ending" },
      inFlight: null,
      billedPlan: CARE,
    });
    const html = await render(CARE_CLIENT);
    expect(html).toContain("Move up to");
    expect(html).toContain("You are on the Care plan");
    const care = card(html, "care");
    expect(care).toContain("Your current plan");
    expect(care).toContain("₹2,999");
  });
});
