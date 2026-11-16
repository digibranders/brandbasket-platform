import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatTiles } from "./stat-tiles";

describe("StatTiles", () => {
  it("renders every figure with its note, and red only for a bad one", () => {
    const html = renderToStaticMarkup(
      createElement(StatTiles, {
        label: "Month figures",
        items: [
          { value: "₹3,42,850", label: "Collected", note: "118 payments", long: true },
          { value: 2, label: "Failed", note: "₹1 not collected", tone: "bad" },
          { value: 0, label: "Needs a look", note: "All clear", tone: "good" },
        ],
      }),
    );
    expect(html).toContain('aria-label="Month figures"');
    expect(html).toContain("₹3,42,850");
    expect(html).toContain("118 payments");
    expect(html).toContain("text-[22px]");
    expect(html.match(/text-neg-text/g)).toHaveLength(1);
    expect(html).toContain("text-pos-text");
  });
});
