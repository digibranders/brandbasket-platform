// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND, type Brand } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import { BrandProvider } from "@/components/panel/brand-provider";
import { WhereItShows } from "@/components/panel/where-it-shows";

function markup(brand: Brand): string {
  // The provider takes its children as a prop, so they are passed as one.
  // eslint-disable-next-line react/no-children-prop
  const tree = createElement(BrandProvider, { brand, children: createElement(WhereItShows, { spot: "gallery", caption: "Your gallery photos show here." }) });
  return renderToStaticMarkup(tree);
}

describe("WhereItShows", () => {
  it("offers the screenshot of a business page where the brand runs the directory", () => {
    expect(markup(LISTING_BRAND)).toContain("See where this shows");
  });

  it("shows Fynix owners nothing: the screenshot is Fynix Digital's directory page", () => {
    expect(markup(BRAND)).toBe("");
  });
});
