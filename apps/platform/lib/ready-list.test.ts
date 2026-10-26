import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadyTask } from "@/components/first-look/ready-list";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("ReadyTask", () => {
  it("says everything is ready, with no empty list, when every item is done", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["website"], doneSteps: ["brand", "content", "domain"] }));
    expect(markup).toContain("All set");
    expect(markup).not.toContain("<ul></ul>");
    expect(markup).toMatch(/3 of 3/);
  });

  it("shows the one open item with its action and counts the done ones", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["website"], doneSteps: ["content", "domain"] }));
    expect(markup).toContain("Upload");
    expect(markup).toContain("2 done");
    expect(markup).not.toContain("All set");
  });

  it("asks a Social-only customer to bring everything to the call", () => {
    const markup = renderToStaticMarkup(createElement(ReadyTask, { services: ["social"], doneSteps: [] }));
    expect(count(markup, "Bring to the call")).toBe(3);
    expect(markup).not.toContain("/onboarding");
  });
});
