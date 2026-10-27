import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Figures } from "./figures";

describe("Figures", () => {
  it("shows each figure's label, value and note, label first", () => {
    const html = renderToStaticMarkup(createElement(Figures, { items: [{ value: "23", label: "New enquiries, 7 days", note: "+6 vs last week" }] }));
    expect(html.indexOf("New enquiries, 7 days")).toBeLessThan(html.indexOf("23"));
    expect(html).toContain("+6 vs last week");
  });

  it("colours the note by its tone", () => {
    const html = renderToStaticMarkup(
      createElement(Figures, {
        items: [
          { value: "3", label: "Failed deliveries", note: "2 emails, 1 webhook", tone: "bad" },
          { value: "7", label: "In build", note: "2 previews due today", tone: "warn" },
          { value: "41", label: "Paying clients", note: "+3 this month", tone: "good" },
        ],
      }),
    );
    expect(html).toContain("text-error");
    expect(html).toContain("text-rattan-ink");
    expect(html).toContain("text-sage");
  });
});
