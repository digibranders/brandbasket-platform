import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Maintenance } from "../components/maintenance";
import { maintenanceDetails, maintenanceMarkup } from "../lib/maintenance-page";

const render = (props: Parameters<typeof Maintenance>[0]): string => renderToStaticMarkup(createElement(Maintenance, props));

describe("Maintenance", () => {
  it("says the site is under maintenance when it knows nothing else", () => {
    const html = render({});
    expect(html).toContain("Under maintenance");
    expect(html).toContain("This website is temporarily unavailable");
    expect(html).not.toContain("<header");
  });

  it("names the business", () => {
    const html = render({ businessName: "Riverside Dental" });
    expect(html).toContain("Riverside Dental");
    expect(html).toContain("website is temporarily unavailable");
  });

  it("never says why the site is paused", () => {
    const html = maintenanceMarkup({ businessName: "Riverside Dental", phone: "+966 13 555 0142", email: "hello@riverside.example" }).toLowerCase();
    for (const word of ["payment", "plan", "suspend", "subscription", "invoice", "brandbasket", "sign in"]) expect(html).not.toContain(word);
  });

  it("shows no contact links unless they are set", () => {
    const html = render({ businessName: "Riverside Dental" });
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("mailto:");
  });

  it("links the phone and the email when they are set", () => {
    const html = render({ phone: "+966 (13) 555-0142", email: "hello@riverside.example" });
    expect(html).toContain('href="tel:+966135550142"');
    expect(html).toContain('href="mailto:hello@riverside.example"');
  });

  it("escapes values that carry markup", () => {
    expect(render({ businessName: "<script>x</script>" })).not.toContain("<script>x");
  });
});

describe("maintenanceDetails", () => {
  it("reads the three hosting settings and trims them", () => {
    expect(maintenanceDetails({ SITE_BUSINESS_NAME: " Riverside Dental ", SITE_CONTACT_PHONE: "+966 13 555 0142", SITE_CONTACT_EMAIL: "hello@riverside.example" })).toEqual({
      businessName: "Riverside Dental",
      phone: "+966 13 555 0142",
      email: "hello@riverside.example",
    });
  });

  it("leaves out empty settings and values that do not look like a phone number or an email", () => {
    expect(maintenanceDetails({ SITE_BUSINESS_NAME: "", SITE_CONTACT_PHONE: "call us", SITE_CONTACT_EMAIL: "not an email" })).toEqual({});
  });
});
