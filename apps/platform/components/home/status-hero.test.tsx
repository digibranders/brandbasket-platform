import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { StatusHero } from "./status-hero";
import { StatusWord } from "./status-word";

const render = (element: ReactElement): string => renderToStaticMarkup(element).replaceAll("<!-- -->", "");

describe("StatusWord", () => {
  it("is a compact pill that never stretches across the card it sits in, and says its state in words", () => {
    const html = render(<StatusWord tone="info">In progress</StatusWord>);
    expect(html).toContain("w-fit");
    expect(html).toContain("justify-self-start");
    expect(html).toContain("In progress");
  });
});

describe("StatusHero", () => {
  const hero = (footer?: string): string =>
    render(
      <StatusHero labelId="status" word="In progress" tone="info" title="We are building your website" footer={footer === undefined ? undefined : <p>{footer}</p>}>
        Soon.
      </StatusHero>,
    );

  it("keeps the path under the status inside the same card, set off by a hairline", () => {
    const html = hero("THE PATH");
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(html).toMatch(/border-t border-line[^>]*><p>THE PATH<\/p>/);
    expect(html.indexOf("We are building your website")).toBeLessThan(html.indexOf("THE PATH"));
  });

  it("draws no hairline or footer when there is none", () => {
    expect(hero()).not.toContain("border-t");
  });
});
