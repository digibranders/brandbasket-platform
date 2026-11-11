import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdsView } from "@/components/ads/ads-view";

const html = renderToStaticMarkup(createElement(AdsView)).replaceAll("<!-- -->", "");

it("sits in the page frame with the title Ads", () => {
  expect(html).toContain(">Ads</h1>");
  expect(html).toContain("@container");
});

it("says plainly that the figures are a sample, and shows them", () => {
  expect(html).toContain("Sample figures for now");
  for (const part of ["Ads in November", "Spent", "₹6,240 of ₹10,000", "Enquiries from ads", "21", "Ad money added by us", "₹1,500"]) expect(html).toContain(part);
});

it("has no button and no form: it asks for nothing and links to nothing", () => {
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<form");
});

it("never uses a dash in what it says", () => {
  expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
