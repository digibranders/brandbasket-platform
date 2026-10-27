// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plan, Subscription } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { PlanSummary } from "@/components/panel/billing/plan-summary";

const PLAN = {
  name: "Services",
  currency: "INR",
  taxRateBasisPoints: 1800,
  recurringAmountCents: 0,
  includedChangeHours: 1,
  extraHourAmountCents: 142_500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 47_500,
} as Plan;

const SUBSCRIPTION = {
  status: "active",
  provider: "razorpay",
  cancelRequestedAt: null,
  discountAmountCents: 0,
  bundledAddOnNetCents: 299_900,
  activatedAt: new Date("2026-10-01T00:00:00Z"),
  commitmentEndsAt: new Date("2026-11-01T00:00:00Z"),
  paidThroughAt: new Date("2026-11-01T00:00:00Z"),
} as Subscription;

function markup(hasWebsite: boolean): string {
  return renderToStaticMarkup(createElement(PlanSummary, { plan: PLAN, subscription: SUBSCRIPTION, now: new Date("2026-10-10T00:00:00Z"), hasWebsite }));
}

describe("PlanSummary", () => {
  it("tells a website client its change hours and blog posts", () => {
    expect(markup(true)).toContain("Your first hour of changes is free");
  });

  it("lists what the website includes for a website client", () => {
    expect(markup(true)).toContain("What’s included");
    expect(markup(true)).toContain("Hosting and SSL certificate");
  });

  it("leaves the website's list and allowances out for a client without a website", () => {
    expect(markup(false)).not.toContain("What’s included");
    expect(markup(false)).not.toContain("Hosting and SSL certificate");
    expect(markup(false)).not.toContain("hour of changes");
  });

  it("is a section on the page with its title and a hairline, not a box", () => {
    const html = markup(true);
    expect(html).toContain('<section aria-labelledby="plan-title"');
    expect(html).toContain('<h2 id="plan-title"');
    expect(html).not.toContain("rounded-card");
    expect(html).not.toContain("bg-card");
  });

  it("shows the price in figures and the next payment in words", () => {
    expect(markup(true)).toContain("per month");
    expect(markup(true)).toContain("Next payment");
  });
});
