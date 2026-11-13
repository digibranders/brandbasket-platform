import { addOnById } from "@brandbasket/shared/lib/billing/add-ons";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AddOnOffer, AddOnPageEntry } from "@/lib/server/add-ons";
import { AddOnRow } from "./add-on-row";
import { PlansHeld } from "./plans-held";
import { ServicesGlance } from "./services-glance";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({ contactEmail: "support@brandbasket.in" })) }));
vi.mock("@/app/app-host/(protected)/services/actions", () => ({ addBundledAddOnAction: vi.fn(), removeBundledAddOnAction: vi.fn() }));

const PAID_THROUGH = new Date("2026-11-12T09:00:00.000Z");
const NEW_DATE = new Date("2026-11-22T09:00:00.000Z");
const PRICE = { listCents: 299_900, netCents: 299_900, discountCents: 0, currency: "INR", taxRateBasisPoints: 1_800 } as never;

const COMBINED: AddOnOffer = {
  kind: "combined",
  upfrontCents: 96_842,
  serviceCents: 100,
  extensionCents: 96_742,
  paidThroughAt: PAID_THROUGH,
  newBillingDate: NEW_DATE,
  monthlyCents: 599_800,
  offer: true,
};

const available = (offer: AddOnOffer): AddOnPageEntry => ({ kind: "available", addOn: "social-media", price: PRICE, offer });

async function tile(entry: AddOnPageEntry, options: { canAdd?: boolean; plansHeld?: { held: number; total: number } | null } = {}): Promise<string> {
  const addOn = addOnById(entry.addOn);
  const element = await AddOnRow({ addOn, entry, canAdd: options.canAdd ?? true, plansHeld: options.plansHeld ?? null });
  return renderToStaticMarkup(element).replaceAll("<!-- -->", "");
}

describe("a service on the first-month offer", () => {
  it("says so, shows ₹1 beside its struck list price with a word for a screen reader, and keeps the status word off the tile", async () => {
    const html = await tile(available(COMBINED));
    expect(html).toContain("₹1 first month");
    expect(html).toContain('<span class="sr-only">usually </span><s>₹2,999</s>');
    expect(html).not.toContain(">Not added<");
  });

  it("opens the confirmation from Add with every line, the total and what follows", async () => {
    const html = await tile(available(COMBINED));
    expect(html).toContain('aria-label="Add Social Media Management"');
    for (const text of [
      "Add Social Media Management",
      "Social Media Management, first month",
      "Your plan, 12 November 2026 to 22 November 2026",
      "Due today",
      "₹968.42",
      "From 22 November 2026, you pay ₹5,998 a month for all your services.",
      "All prices include GST.",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Pay ₹968.42");
  });
});

describe("a service that can be added at its price", () => {
  it("shows Not added and its price, with no offer badge and no struck price", async () => {
    const html = await tile(available({ ...COMBINED, offer: false, serviceCents: 250_000 } as AddOnOffer));
    expect(html).toContain(">Not added<");
    expect(html).toContain("₹2,999");
    expect(html).not.toContain("first month</span>");
    expect(html).not.toContain("<s>");
    expect(html).toContain("Social Media Management, until 22 November 2026");
  });

  it("opens the charge for the rest of the month in the same confirmation when it is not combined", async () => {
    const html = await tile(available({ kind: "quote", chargeCents: 373_032, daysLeft: 14, nextRenewalCents: 1_179_882, renewsOn: PAID_THROUGH }));
    expect(html).toContain("Social Media Management, 14 days left this month");
    expect(html).toContain("Pay ₹3,730.32");
    expect(html).toContain("Then ₹11,798.82 a month from 12 November 2026.");
  });

  it("offers no Add while a payment is being confirmed", async () => {
    const html = await tile(available(COMBINED), { canAdd: false });
    expect(html).not.toContain("Add Social Media Management\"");
    expect(html).not.toContain("<dialog");
  });
});

describe("a service that cannot be added now", () => {
  it("says the plan changes first, and when, with no Add", async () => {
    const html = await tile(available({ kind: "change-pending", changesOn: PAID_THROUGH }));
    expect(html).toContain("Your plan changes on 12 November 2026. You can add a new service after that.");
    expect(html).not.toContain("<dialog");
  });

  it("says how to ask for it when it has to go through the team", async () => {
    const html = await tile(available({ kind: "write" }));
    expect(html).toContain("mailto:support@brandbasket.in?subject=Add%20Social%20Media%20Management");
  });
});

describe("a service that is on", () => {
  const included: AddOnPageEntry = { kind: "included", addOn: "social-media", price: PRICE, endsOn: null, nextBillingOn: PAID_THROUGH, joinsOn: null, keepable: false, drop: null };

  it("is marked On in words, with its price and no offer", async () => {
    const html = await tile(included);
    expect(html).toContain(">On<");
    expect(html).toContain("Included in your monthly plan payment.");
    expect(html).not.toContain("first month");
  });

  it("says when it stops, and offers Keep with no confirmation, when it is ending", async () => {
    const html = await tile({ ...included, endsOn: PAID_THROUGH, keepable: true });
    expect(html).toContain(">Ending<");
    expect(html).toContain("Stops on 12 November 2026.");
    expect(html).toContain('aria-label="Add Social Media Management"');
    expect(html).not.toContain("<dialog");
  });
});

describe("the tile's layout", () => {
  it("has no fixed height, so a phone's single column leaves no tall empty gaps", async () => {
    const opening = (await tile(available(COMBINED))).match(/^<li class="([^"]*)"/)?.[1] ?? "";
    expect(opening).toContain("grid");
    expect(opening).not.toMatch(/(^| )(min-h-|h-)/);
  });
});

describe("Dedicated Expert Monitoring", () => {
  const monitoring: AddOnPageEntry = { kind: "available", addOn: "expert-monitoring", price: PRICE, offer: { kind: "write" } };

  it("shows how many of the three plans are held while it is not on", async () => {
    const html = await tile(monitoring, { plansHeld: { held: 2, total: 3 } });
    expect(html).toContain("You have 2 of 3 plans.");
  });

  it("shows nothing of the count on another service", async () => {
    expect(await tile(available({ kind: "write" }), { plansHeld: { held: 2, total: 3 } })).not.toContain("You have");
  });
});

describe("PlansHeld", () => {
  it("draws three segments, one filled per plan held, named for a screen reader", () => {
    const html = renderToStaticMarkup(PlansHeld({ held: 2, total: 3 }));
    expect(html).toContain('aria-label="2 of 3 plans"');
    expect(html.match(/bg-sage"/g)).toHaveLength(2);
    expect(html.match(/bg-sunken"/g)).toHaveLength(1);
    expect(html).toContain("You have 2 of 3 plans.");
  });
});

describe("ServicesGlance", () => {
  it("shows the next payment with its date and how many plans are held, with the monitoring note", () => {
    const html = renderToStaticMarkup(ServicesGlance({ glance: { next: { amount: "₹5,998", on: "22 November 2026" }, plansHeld: 2, plansTotal: 3 } })).replaceAll("<!-- -->", "");
    expect(html).toContain("Next payment");
    expect(html).toContain("₹5,998");
    expect(html).toContain("22 November 2026");
    expect(html).toContain("Your plans");
    expect(html).toContain("2 <span");
    expect(html).toContain("of 3");
    expect(html).toContain("Dedicated Expert Monitoring is free with all three");
  });

  it("is one column on a phone and leaves out the next payment when none follows", () => {
    const withNext = renderToStaticMarkup(ServicesGlance({ glance: { next: { amount: "₹1", on: "x" }, plansHeld: 0, plansTotal: 3 } }));
    expect(withNext).toContain("@xl:grid-cols-2");
    const without = renderToStaticMarkup(ServicesGlance({ glance: { next: null, plansHeld: 0, plansTotal: 3 } }));
    expect(without).not.toContain("Next payment");
    expect(without).not.toContain("grid-cols-2");
  });
});
