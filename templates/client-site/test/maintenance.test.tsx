import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Maintenance } from "../components/maintenance";

const render = (props: Parameters<typeof Maintenance>[0]): string => renderToStaticMarkup(createElement(Maintenance, props));

describe("Maintenance", () => {
  it("says the site will be back soon when it knows nothing else", () => {
    const html = render({});
    expect(html).toContain("We&#x27;ll be back soon");
  });

  it("names the business", () => {
    const html = render({ businessName: "Riverside Dental" });
    expect(html).toContain("Riverside Dental is taking a short break");
  });

  it("shows no contact details and no links", () => {
    const html = render({ businessName: "Riverside Dental" });
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("<a ");
  });

  it("escapes a business name that carries markup", () => {
    expect(render({ businessName: "<script>x</script>" })).not.toContain("<script>x");
  });
});
