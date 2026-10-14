// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRANDS } from "./brand";
import { BrandProvider } from "@/components/panel/brand-provider";
import { WhereItShows } from "@/components/panel/where-it-shows";

function markup(brand: (typeof BRANDS)[keyof typeof BRANDS]): string {
  // The provider takes its children as a prop, so they are passed as one.
  // eslint-disable-next-line react/no-children-prop
  const tree = createElement(BrandProvider, { brand, children: createElement(WhereItShows, { spot: "gallery", caption: "Your gallery photos show here." }) });
  return renderToStaticMarkup(tree);
}

describe("WhereItShows", () => {
  it("offers the screenshot of a business page where the brand runs the directory", () => {
    expect(markup(BRANDS.firstfold)).toContain("See where this shows");
  });

  it("shows Fynix owners nothing: the screenshot is Firstfold's directory page", () => {
    expect(markup(BRANDS.fynix)).toBe("");
  });
});
