import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WebsiteStepper } from "./website-stepper";

const render = (stage: Parameters<typeof WebsiteStepper>[0]["stage"]): string => renderToStaticMarkup(createElement(WebsiteStepper, { stage }));

describe("WebsiteStepper", () => {
  it("names the five stages and marks the current one", () => {
    const html = render("building");
    for (const label of ["Kickoff", "Build", "Preview", "Launch", "Live"]) expect(html).toContain(label);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("marks no step current once live, and says nothing about a hold", () => {
    const html = render("live");
    expect(html).not.toContain('aria-current="step"');
    expect(html).not.toContain("No stage is current");
  });

  it("says in words that no stage is current while on hold or cancelled", () => {
    expect(render("hold")).toContain("On hold. No stage is current until the build resumes.");
    expect(render("cancelled")).toContain("Cancelled. No stage is current.");
    expect(render("hold")).not.toContain('aria-current="step"');
  });
});
