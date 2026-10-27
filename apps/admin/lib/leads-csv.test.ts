import type { Lead } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { leadsCsv } from "./leads-csv";

const LEAD: Lead = {
  id: "lead-1",
  name: "Neha Joshi",
  businessName: "Green Leaf Cafe, FC Road",
  email: "neha@example.com",
  phone: "+919822014567",
  businessType: null,
  currency: "INR",
  message: null,
  status: "new",
  notes: null,
  businessId: null,
  attachedByStaffId: null,
  attachedAt: null,
  source: "pricing_page",
  plans: ["website", "growth"],
  city: "Pune",
  page: "/contact",
  assignedStaffId: "staff-1",
  createdAt: new Date("2026-11-30T09:12:00.000Z"),
};

describe("leadsCsv", () => {
  it("writes a header and one row per enquiry, quoting commas and defusing formulas", () => {
    expect(leadsCsv([LEAD], () => "Riya Kapoor")).toBe(
      [
        "Received,Business,Name,Email,Phone,City,Source,Wants,Status,Owner",
        `2026-11-30T09:12:00.000Z,"Green Leaf Cafe, FC Road",Neha Joshi,neha@example.com,'+919822014567,Pune,Pricing page,Website + Social & Ads,New,Riya Kapoor`,
        "",
      ].join("\r\n"),
    );
  });

  it("leaves an unowned enquiry's owner empty", () => {
    expect(leadsCsv([{ ...LEAD, assignedStaffId: null, phone: null }], () => "x").split("\r\n")[1]?.endsWith(",New,")).toBe(true);
  });
});
