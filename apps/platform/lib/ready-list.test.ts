import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadyTask } from "@/components/first-look/ready-list";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("ReadyTask", () => {
  it("says everything is ready, with no empty list, when every item is done", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["website"], doneSteps: ["brand", "content", "domain"], doneSetup: [] }));
    expect(markup).toContain("All set");
    expect(markup).not.toContain("<ul></ul>");
    expect(markup).toMatch(/3 of 3/);
  });

  it("shows the one open item with its action and counts the done ones", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["website"], doneSteps: ["content", "domain"], doneSetup: [] }));
    expect(markup).toContain("Upload");
    expect(markup).toContain("2 done");
    expect(markup).not.toContain("All set");
  });

  it("sends a Social-only customer's items to the To do page", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["social"], doneSteps: [], doneSetup: [] }));
    expect(markup).not.toContain("Bring to the call");
    expect(markup).not.toContain("/onboarding");
    expect(count(markup, "Add</a>")).toBe(3);
    for (const key of ["accounts", "offers", "budget"]) expect(markup).toContain(`href="/todo?focus=${key}#${key}"`);
    expect(markup).toContain('aria-label="Add Instagram and Facebook pages"');
  });

  it("shows Edit and counts an item whose answer is saved", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["social"], doneSteps: [], doneSetup: ["accounts"] }));
    expect(markup).toMatch(/1 of 3/);
    expect(markup).toContain("1 done");
    expect(markup).toContain('aria-label="Edit Instagram and Facebook pages"');
    expect(markup).toContain('href="/todo?focus=accounts#accounts"');
  });
});
