import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/personalize/actions", () => ({ continueToCheckoutAction: vi.fn(), toggleServiceAction: vi.fn() }));

import { IntakeSummary } from "./intake-summary";

const html = (): string =>
  renderToStaticMarkup(
    createElement(IntakeSummary, {
      rows: [{ field: "businessType", label: "Business", value: "Dental" }],
      services: ["managed-website"],
      prices: { "managed-website": "₹2,999", "social-media-ads": "₹9,999", "local-seo-aeo": "₹24,999" },
      currency: "INR",
      unanswered: 0,
      firstUnansweredHref: null,
    } as never),
  );

describe("IntakeSummary", () => {
  it("lists the services before what was understood about the business", () => {
    const out = html();
    expect(out.indexOf("Your services")).toBeGreaterThan(-1);
    expect(out.indexOf("About your business")).toBeGreaterThan(out.indexOf("Your services"));
  });

  it("keeps Continue to checkout last", () => {
    const out = html();
    expect(out.indexOf("Continue to checkout")).toBeGreaterThan(out.indexOf("About your business"));
  });
});
