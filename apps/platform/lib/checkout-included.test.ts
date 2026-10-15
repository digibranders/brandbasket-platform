import { describe, expect, it } from "vitest";
import { MAINTENANCE_INCLUDED, WEBSITE_INCLUDED } from "./checkout-included";

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
      "Security monitoring",
      "Performance monitoring",
      "Hosting and uptime monitoring",
      "Routine updates and upkeep",
      "Monthly health report",
    ]);
    const icons = [...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED].map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("uses no dashes as punctuation and no exclamation marks", () => {
    for (const item of [...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED]) expect(item.text).not.toMatch(/[!—–]/);
  });
});
