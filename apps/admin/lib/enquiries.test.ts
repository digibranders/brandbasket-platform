import type { Lead, LeadInvite } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { bucketOf, enquiryHref, filterEnquiries, inviteStateOf, leadHistory, readEnquiryQuery, waitingOf } from "./enquiries";

const NOW = new Date("2026-11-30T12:00:00.000Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    name: "Neha Joshi",
    businessName: "Green Leaf Cafe",
    email: "neha@example.com",
    phone: null,
    businessType: null,
    currency: "INR",
    message: null,
    status: "new",
    notes: null,
    businessId: null,
    attachedByStaffId: null,
    attachedAt: null,
    source: "website_form",
    plans: [],
    city: null,
    page: null,
    assignedStaffId: null,
    createdAt: new Date("2026-11-30T09:00:00.000Z"),
    ...overrides,
  };
}

describe("bucketOf", () => {
  it("puts new enquiries and unpaid sign-ups to contact, and the rest where they belong", () => {
    expect(bucketOf("new")).toBe("to_contact");
    expect(bucketOf("account_created")).toBe("to_contact");
    expect(bucketOf("call_done")).toBe("talking");
    expect(bucketOf("invite_sent")).toBe("link_sent");
    expect(bucketOf("paid")).toBe("won");
    expect(bucketOf("lost")).toBe("lost");
  });
});

describe("readEnquiryQuery", () => {
  it("opens on To contact, and on All when searching", () => {
    expect(readEnquiryQuery({})).toEqual({ bucket: "to_contact", source: "any", owner: "anyone", search: "" });
    expect(readEnquiryQuery({ q: " neha " })).toMatchObject({ bucket: "all", search: "neha" });
  });

  it("keeps a known view, source and owner, and ignores anything else", () => {
    expect(readEnquiryQuery({ view: "won", source: "signup", owner: "me" })).toEqual({ bucket: "won", source: "signup", owner: "me", search: "" });
    expect(readEnquiryQuery({ view: "paid", source: "chatbot", owner: "riya" })).toEqual({ bucket: "to_contact", source: "any", owner: "anyone", search: "" });
  });
});

describe("enquiryHref", () => {
  it("writes the view always and the rest only when set", () => {
    const query = readEnquiryQuery({});
    expect(enquiryHref(query)).toBe("/leads?view=to_contact");
    expect(enquiryHref(query, { source: "pricing_page", owner: "nobody", search: "cafe" }, "/leads/lead-1")).toBe("/leads/lead-1?view=to_contact&source=pricing_page&owner=nobody&q=cafe");
  });
});

describe("filterEnquiries", () => {
  const rows = [
    lead({ id: "a", status: "new", source: "website_form", assignedStaffId: "staff-1" }),
    lead({ id: "b", status: "account_created", source: "signup" }),
    lead({ id: "c", status: "paid", source: "pricing_page", businessName: "Bloom Florist" }),
  ];
  const text = (row: Lead): string => `${row.businessName} ${row.email}`;

  it("filters by view, source, owner and search together", () => {
    expect(filterEnquiries(rows, readEnquiryQuery({}), "staff-1", text).map((row) => row.id)).toEqual(["a", "b"]);
    expect(filterEnquiries(rows, readEnquiryQuery({ view: "to_contact", owner: "me" }), "staff-1", text).map((row) => row.id)).toEqual(["a"]);
    expect(filterEnquiries(rows, readEnquiryQuery({ view: "to_contact", owner: "nobody" }), "staff-1", text).map((row) => row.id)).toEqual(["b"]);
    expect(filterEnquiries(rows, readEnquiryQuery({ view: "all", source: "pricing_page" }), "staff-1", text).map((row) => row.id)).toEqual(["c"]);
    expect(filterEnquiries(rows, readEnquiryQuery({ q: "BLOOM" }), "staff-1", text).map((row) => row.id)).toEqual(["c"]);
  });
});

describe("waitingOf", () => {
  it("is soon after an hour and late after a day while nobody has got in touch", () => {
    expect(waitingOf(new Date("2026-11-30T11:30:00.000Z"), NOW, "new")).toEqual({ label: "30m", tone: "plain" });
    expect(waitingOf(new Date("2026-11-30T09:00:00.000Z"), NOW, "new")).toEqual({ label: "3h", tone: "soon" });
    expect(waitingOf(new Date("2026-11-28T12:00:00.000Z"), NOW, "account_created")).toEqual({ label: "2d", tone: "late" });
  });

  it("is plain once someone is talking to them", () => {
    expect(waitingOf(new Date("2026-11-28T12:00:00.000Z"), NOW, "call_done")).toEqual({ label: "2d", tone: "plain" });
  });
});

describe("inviteStateOf", () => {
  const invite: LeadInvite = { id: "i", createdAt: new Date("2026-11-29T10:00:00.000Z"), expiresAt: new Date("2026-12-06T10:00:00.000Z"), redeemedAt: null, revokedAt: null };
  it("is used, withdrawn, expired or open", () => {
    expect(inviteStateOf({ ...invite, redeemedAt: NOW }, NOW)).toBe("used");
    expect(inviteStateOf({ ...invite, revokedAt: NOW }, NOW)).toBe("withdrawn");
    expect(inviteStateOf({ ...invite, expiresAt: NOW }, NOW)).toBe("expired");
    expect(inviteStateOf(invite, NOW)).toBe("open");
  });
});

describe("leadHistory", () => {
  it("lists what happened to a lead, newest first", () => {
    const invite: LeadInvite = { id: "i", createdAt: new Date("2026-11-30T10:00:00.000Z"), expiresAt: new Date("2026-12-07T10:00:00.000Z"), redeemedAt: new Date("2026-11-30T11:00:00.000Z"), revokedAt: null };
    expect(leadHistory(lead(), [invite], "Website form").map((line) => line.text)).toEqual([
      "Setup link used, account created",
      "Setup link sent",
      "Arrived: Website form",
    ]);
  });
});
