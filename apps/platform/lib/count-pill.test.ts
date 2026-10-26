import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CountPill } from "@/components/v2/count-pill";

const render = (count: number | undefined, current: boolean): string => renderToStaticMarkup(createElement(CountPill, { count, current }));

it("shows the number with an accessible name", () => {
  const html = render(3, false);
  expect(html).toContain(">3<");
  expect(html).toContain('aria-label="3 open"');
});

it("is hidden on the current page and when there is no count", () => {
  expect(render(3, true)).toBe("");
  expect(render(undefined, false)).toBe("");
});
