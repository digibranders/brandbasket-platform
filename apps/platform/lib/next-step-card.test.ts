import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NextStepCard } from "@/components/panel/next-step-card";

const render = (buildStageIndex: number): string =>
  renderToStaticMarkup(createElement(NextStepCard, { step: { kind: "building", slaDueAt: null }, buildStageIndex })).replaceAll("<!-- -->", "");

it("draws where the build is as a hairline section called What happens next, not a box", () => {
  const html = render(1);
  expect(html).toContain(">What happens next</h2>");
  expect(html).toContain("We’re building your website");
  expect(html).toContain('href="/project"');
  expect(html).not.toContain("shadow-lift");
});

it("marks the stage in progress, and the ones before it as done, in words as well as colour", () => {
  const html = render(1);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain("Set up your website<span class=\"sr-only\"> (done)</span>");
  expect(html).toContain("We build it<span class=\"sr-only\"> (next)</span>");
});

it("draws nothing while the customer is still setting up", () => {
  expect(renderToStaticMarkup(createElement(NextStepCard, { step: { kind: "start-onboarding" }, buildStageIndex: 0 }))).toBe("");
});
