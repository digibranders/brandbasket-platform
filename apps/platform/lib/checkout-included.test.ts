import { describe, expect, it } from "vitest";
import { MAINTENANCE_INCLUDED, MANAGED_WEBSITE_INCLUDED, WEBSITE_INCLUDED } from "./checkout-included";

describe("what the checkout lists as included", () => {
  it("lists the website's six points and the maintenance's five, each with its own icon", () => {
    expect(WEBSITE_INCLUDED.map((item) => item.text)).toEqual([
      "Professional design",
      "Up to 5 pages",
      "Mobile-friendly (works on all devices)",
      "Enquiry forms and click-to-call",
      "Local SEO foundation",
      "OyeChats professional chatbot",
    ]);
    expect(MAINTENANCE_INCLUDED.map((item) => item.text)).toEqual([
      "Hosting, SSL and uptime monitoring",
      "Security checks, backups and maintenance",
      "Bug fixes and small mobile fixes",
      "2 small content edits a month",
      "Monthly health report",
    ]);
    const icons = [...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED].map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("lists the Managed Website line's inclusions as the website's points then the maintenance's", () => {
    expect(MANAGED_WEBSITE_INCLUDED).toEqual([...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED]);
  });

  it("uses no dashes as punctuation and no exclamation marks", () => {
    for (const item of [...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED]) expect(item.text).not.toMatch(/[!—–]/);
  });
});
