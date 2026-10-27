import { describe, expect, it, vi } from "vitest";
import type { StaffPaymentRow } from "@brandbasket/db";
import { clientHits, invoiceHits, leadHits, normaliseSearchTerm, paymentHits, requestHits, SEARCH_LIMIT_PER_KIND } from "./console-search";

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

describe("paymentHits", () => {
  it("lists payments as the database found them and opens each on the client's Billing tab", () => {
    const failed: StaffPaymentRow = {
      id: "p1",
      businessId: "b1",
      businessName: "Om Sweets",
      provider: "razorpay",
      providerPaymentId: "pay_failed_1",
      kind: "renewal",
      amountCents: 299_900,
      currency: "INR",
      status: "failed",
      paidAt: null,
      createdAt: new Date("2026-11-28T04:30:00.000Z"),
      method: null,
      failureReason: "Card declined",
      attentionReason: null,
      attentionResolvedAt: null,
      recordedByName: null,
      refundedAmountCents: null,
      refundReason: null,
      invoiceNumber: null,
    };
    expect(paymentHits([failed])).toEqual([
      { kind: "payment", label: "Om Sweets · ₹2,999", sub: "pay_failed_1 · Failed", href: "/clients/b1/billing#payment-p1" },
    ]);
  });
});

