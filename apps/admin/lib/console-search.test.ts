import { describe, expect, it, vi } from "vitest";
import { clientHits, invoiceHits, leadHits, normaliseSearchTerm, requestHits, SEARCH_LIMIT_PER_KIND } from "./console-search";

vi.mock("server-only", () => ({}));

describe("normaliseSearchTerm", () => {
  it("trims and lower-cases what staff typed", () => {
    expect(normaliseSearchTerm("  Sai Dental ")).toBe("sai dental");
  });

  it("refuses anything too short, too long or not text", () => {
    expect(normaliseSearchTerm("s")).toBeNull();
    expect(normaliseSearchTerm("x".repeat(81))).toBeNull();
    expect(normaliseSearchTerm(42)).toBeNull();
    expect(normaliseSearchTerm(null)).toBeNull();
  });
});

describe("hits", () => {
  it("finds clients by business or owner and links to the client", () => {
    const clients = [
      { businessId: "b1", businessName: "Sai Dental Care", owner: { name: "Priya Sharma", email: "priya@sai.example", phone: null } },
      { businessId: "b2", businessName: "Om Sweets", owner: null },
    ];
    expect(clientHits(clients, "priya")).toEqual([{ kind: "client", label: "Sai Dental Care", sub: "Priya Sharma", href: "/clients/b1" }]);
  });

  it("finds enquiries and says their status", () => {
    const leads = [{ id: "l1", businessName: "Green Leaf Cafe", name: "Neha Joshi", email: "neha@greenleaf.example", phone: null, status: "new" as const }];
    expect(leadHits(leads, "green")).toEqual([{ kind: "enquiry", label: "Green Leaf Cafe", sub: "Neha Joshi · New", href: "/leads/l1" }]);
  });

  it("lists requests and invoices as the database found them", () => {
    expect(requestHits([{ id: "t1", subject: "Change the opening hours", displayRef: "R-0152" }])).toEqual([
      { kind: "request", label: "Change the opening hours", sub: "R-0152", href: "/support/t1" },
    ]);
    expect(invoiceHits([{ id: "i1", number: "FY/26-27/000031", issuedOn: "2026-11-26", recipient: { legalName: "Sai Dental Care" } }])).toEqual([
      { kind: "invoice", label: "FY/26-27/000031", sub: "Sai Dental Care", href: "/invoices?month=2026-11" },
    ]);
  });

  it("keeps at most a few of each kind", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ businessId: `b${index}`, businessName: `Bakery ${index}`, owner: null }));
    expect(clientHits(many, "bakery")).toHaveLength(SEARCH_LIMIT_PER_KIND);
  });
});
