import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteContactFigures } from "@/components/panel/oyechats/site-contact-figures";
import { measuredContacts } from "./site-contacts";

const NONE = { call: 0, whatsapp: 0, form: 0 };

describe("measuredContacts", () => {
  it("shows nothing for a website that has reported no contact in 90 days, rather than three zeros nobody measured", () => {
    expect(measuredContacts(NONE, NONE)).toBeNull();
  });

  it("shows the last 30 days when the website reported anything in them", () => {
    const recent = { call: 4, whatsapp: 2, form: 1 };
    expect(measuredContacts(recent, recent)).toEqual(recent);
  });

  it("shows a quiet month as a real zero once the website has reported before it", () => {
    expect(measuredContacts(NONE, { call: 3, whatsapp: 0, form: 2 })).toEqual(NONE);
  });
});

describe("SiteContactFigures", () => {
  const html = renderToStaticMarkup(createElement(SiteContactFigures, { contacts: { call: 4, whatsapp: 2, form: 0 } })).replaceAll("<!-- -->", "");

  it("names the three kinds, the window and their counts", () => {
    for (const text of ["Contacts from your website", "Last 30 days", "Calls", "WhatsApp", "Forms"]) expect(html).toContain(text);
    expect(html).toMatch(/Calls<\/dt><dd[^>]*>4</);
    expect(html).toMatch(/Forms<\/dt><dd[^>]*>0</);
  });

  it("never uses a dash in what it says", () => {
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
  });
});
