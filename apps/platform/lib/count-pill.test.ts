import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CountPill } from "@/components/v2/count-pill";

const render = (count: number | undefined, current: boolean): string => renderToStaticMarkup(createElement(CountPill, { count, current }));

it("shows the number and says what it counts to a screen reader", () => {
  const html = render(3, false);
  expect(html).toContain('<span aria-hidden="true">3</span><span class="sr-only">, 3 waiting</span>');
  expect(html).not.toContain("aria-label");
});

it("is hidden on the current page and when there is no count", () => {
  expect(render(3, true)).toBe("");
  expect(render(undefined, false)).toBe("");
});
