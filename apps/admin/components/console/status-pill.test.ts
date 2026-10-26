import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("shows its words and the colours of its tone", () => {
    const html = renderToStaticMarkup(createElement(StatusPill, { tone: "problem", children: "Bad signature" }));
    expect(html).toContain("Bad signature");
    expect(html).toContain("text-error");
  });

  it("has a look for every tone", () => {
    for (const tone of ["wait", "done", "progress", "todo", "problem"] as const) {
      expect(renderToStaticMarkup(createElement(StatusPill, { tone, children: tone }))).toMatch(/class="[^"]*bg-/);
    }
  });
});
