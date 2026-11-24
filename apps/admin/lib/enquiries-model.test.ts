import type { Lead } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { readEnquiryQuery } from "./enquiries";
import { enquiryListHref, toEnquiryRow } from "./enquiries-model";

const NOW = new Date("2026-11-30T12:00:00.000Z");
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    name: "Neha Joshi",
    businessName: "Green Leaf Cafe",
    email: "neha@example.com",
    phone: null,
    currency: "INR",
    message: null,
    status: "new",
    notes: null,
    businessId: null,
    source: "website_form",
    plans: ["website"],
    city: "Pune",
    page: null,
    assignedStaffId: "someone",
    createdAt: hoursAgo(0.5),
    ...overrides,
  } as unknown as Lead;
}

describe("toEnquiryRow", () => {
  it("is plain inside the first hour and red after it while nobody has been in touch", () => {
    expect(toEnquiryRow(lead({ createdAt: hoursAgo(0.5) }), NOW)).toMatchObject({ waiting: { text: "30m", late: false }, chips: [] });
    expect(toEnquiryRow(lead({ createdAt: hoursAgo(2.25) }), NOW)).toMatchObject({ waiting: { text: "2h 15m", late: true }, chips: [{ label: "Late", variant: "failed" }] });
  });

  it("never marks an enquiry that is being talked to as late", () => {
    expect(toEnquiryRow(lead({ status: "call_done", createdAt: hoursAgo(30) }), NOW)).toMatchObject({ waiting: { text: "1d 06h", late: false }, chips: [] });
  });

  it("flags a sign-up that has not paid after two days, and words its source", () => {
    const row = toEnquiryRow(lead({ source: "signup", status: "account_created", createdAt: hoursAgo(51) }), NOW);
    expect(row.sourceLabel).toBe("Sign-up, not paid");
    expect(row.chips.map((chip) => chip.label)).toEqual(["Late", "Not paid"]);
    expect(toEnquiryRow(lead({ source: "signup", status: "account_created", createdAt: hoursAgo(10) }), NOW).chips.map((chip) => chip.label)).toEqual(["Late"]);
  });

  it("offers Mark contacted only for new, Mark lost only where staff may change the status", () => {
    expect(toEnquiryRow(lead({ status: "new" }), NOW)).toMatchObject({ canMarkContacted: true, canMarkLost: true });
    expect(toEnquiryRow(lead({ status: "call_done" }), NOW)).toMatchObject({ canMarkContacted: false, canMarkLost: true });
    expect(toEnquiryRow(lead({ status: "account_created" }), NOW)).toMatchObject({ canMarkContacted: false, canMarkLost: false });
    expect(toEnquiryRow(lead({ status: "lost" }), NOW)).toMatchObject({ canMarkLost: false });
  });

  it("carries no owner and says whether the person already has a business", () => {
    const row = toEnquiryRow(lead({ businessId: "b-1" }), NOW);
    expect(row.businessId).toBe("b-1");
    expect(JSON.stringify(row)).not.toContain("someone");
  });
});

describe("enquiryListHref", () => {
  it("drops a stale owner filter and adds the open enquiry", () => {
    const query = readEnquiryQuery({ view: "talking", owner: "me", q: "leaf" });
    expect(enquiryListHref(query)).toBe("/leads?view=talking&q=leaf");
    expect(enquiryListHref(query, "lead-1")).toBe("/leads?view=talking&q=leaf&open=lead-1");
  });
});
