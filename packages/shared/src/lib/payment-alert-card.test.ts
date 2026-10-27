import { describe, expect, it } from "vitest";
import { describePaymentMethod, paymentTeamsCard, planStatusTeamsCard, type PaymentCardInput } from "./payment-alert-card";

type Block = { type: string; text?: string; facts?: { title: string; value: string }[] };
const parts = (input: PaymentCardInput): { body: Block[]; actions?: { title: string; url: string }[] } =>
  paymentTeamsCard(input).attachments[0].content as { body: Block[]; actions?: { title: string; url: string }[] };
const facts = (input: PaymentCardInput): Record<string, string> => Object.fromEntries((parts(input).body.find((block) => block.type === "FactSet")?.facts ?? []).map((fact) => [fact.title, fact.value]));

const NO_METHOD = { method: null, cardNetwork: null, cardType: null, cardLast4: null, upiVpa: null, manualReference: null };
const BASE: PaymentCardInput = {
  kind: "initial",
  amountCents: 1_169_900,
  currency: "INR",
  paidAt: new Date("2026-10-26T12:24:17.000Z"),
  attentionReason: null,
  paymentNumber: 1,
  provider: "razorpay",
  providerPaymentId: "pay_Qx123",
  method: { ...NO_METHOD, method: "upi", upiVpa: "asha@okhdfc" },
  customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
  business: { name: "Rao Clinic", websiteUrl: "https://raoclinic.in" },
  lines: [
    { title: "Managed Website", listCents: 299_900, offerCents: 29_990 },
    { title: "Social Media and Ads", listCents: 999_900, offerCents: 99_910 },
  ],
  code: { code: "FRIEND10", takesOffCents: 50_000 },
  adCreditCents: 150_000,
  paidThrough: new Date("2026-11-26T12:24:17.000Z"),
  invoice: { number: "BB/2026-27/0001", totalCents: 1_169_900, gstCents: 178_460 },
  billing: { legalName: "Rao Clinic LLP", gstin: "27AAPFU0939F1ZV" },
  consoleUrl: "https://console.example/clients/biz-1",
};

describe("paymentTeamsCard", () => {
  it("calls a new customer's first payment out, with everything about who paid and what for", () => {
    const card = parts(BASE);
    expect(card.body[0]?.text).toBe("New customer paid: ₹11,699");
    expect(card.body[1]?.text).toBe("Rao Clinic, first payment");
    expect(facts(BASE)).toEqual({
      Customer: "Asha Rao",
      Email: "asha@example.com",
      Phone: "+91 98200 11111",
      Business: "Rao Clinic",
      Website: "https://raoclinic.in",
      Paid: "₹11,699 (₹1,784.60 GST inside)",
      "Managed Website": "₹2,999",
      "Social Media and Ads": "₹9,999",
      "Package offer": "-₹1,299",
      "Code FRIEND10": "-₹500 a month",
      "Ad money": "₹1,500 a month",
      Payment: "The customer's first payment",
      "Paid with": "UPI (asha@okhdfc)",
      "Paid on": "26 Oct 2026, 5:54 pm IST",
      "Runs until": "26 Nov 2026, 5:54 pm IST",
      Invoice: "BB/2026-27/0001, ₹11,699",
      "Billed to": "Rao Clinic LLP, GSTIN 27AAPFU0939F1ZV",
      "Provider id": "razorpay pay_Qx123",
    });
    expect(card.actions).toEqual([{ type: "Action.OpenUrl", title: "Open the client", url: "https://console.example/clients/biz-1" }]);
  });

  it("names a repeat payment by its kind and counts it", () => {
    const renewal = { ...BASE, kind: "renewal" as const, paymentNumber: 4, adCreditCents: 0, code: null };
    expect(parts(renewal).body[0]?.text).toBe("Renewal received: ₹11,699");
    expect(facts(renewal).Payment).toBe("Payment number 4");
    expect(facts(renewal)).not.toHaveProperty("Ad money");
    expect(facts(renewal)).not.toHaveProperty("Code");
    for (const [kind, title] of [["reactivation", "Reactivation received"], ["add_on", "Add-on payment received"], ["charge", "One-off charge received"]] as const) {
      expect(parts({ ...renewal, kind }).body[0]?.text).toBe(`${title}: ₹11,699`);
    }
  });

  it("says plainly when money arrived that bought nothing, with why, and no run-until date", () => {
    const stuck = { ...BASE, attentionReason: "already_paid", paidThrough: new Date("2026-11-26T12:24:17.000Z") };
    const card = parts(stuck);
    expect(card.body[0]?.text).toBe("Payment needs attention: ₹11,699");
    expect(card.body[1]?.text).toBe("Rao Clinic");
    expect(card.body.at(-1)?.text).toBe("The business already had access, so this is a duplicate charge to refund. Nothing was activated.");
    expect(facts(stuck)).not.toHaveProperty("Runs until");
  });

  it("keeps a payment that applied but needs a follow-up as a normal payment, with the follow-up as the note", () => {
    const pending = { ...BASE, kind: "add_on" as const, attentionReason: "add_on_provider_pending" };
    const card = parts(pending);
    expect(card.body[0]?.text).toBe("Add-on payment received: ₹11,699");
    expect(card.body.at(-1)?.text).toContain("not yet been told to bill it");
  });

  it("writes dollars without GST, and leaves out what is not known", () => {
    const usd = { ...BASE, currency: "USD" as const, amountCents: 19_400, invoice: null, billing: null, code: null, adCreditCents: 0, paidAt: null, customer: { name: null, email: "asha@example.com", phone: null }, business: { name: "Rao Clinic", websiteUrl: null }, method: NO_METHOD };
    expect(parts(usd).body[0]?.text).toBe("New customer paid: $194");
    expect(facts(usd)).toEqual({
      Email: "asha@example.com",
      Business: "Rao Clinic",
      Paid: "$194",
      "Managed Website": "$2,999",
      "Social Media and Ads": "$9,999",
      "Package offer": "-$1,299",
      Payment: "The customer's first payment",
      "Runs until": "26 Nov 2026, 5:54 pm IST",
      "Provider id": "razorpay pay_Qx123",
    });
  });
});

describe("describePaymentMethod", () => {
  it("describes how each kind of payment was made", () => {
    expect(describePaymentMethod({ ...NO_METHOD, method: "upi" })).toBe("UPI");
    expect(describePaymentMethod({ ...NO_METHOD, method: "card", cardNetwork: "Visa", cardType: "credit", cardLast4: "4242" })).toBe("Visa credit card ending 4242");
    expect(describePaymentMethod({ ...NO_METHOD, method: "card" })).toBe("Card card");
    expect(describePaymentMethod({ ...NO_METHOD, method: "netbanking" })).toBe("netbanking");
    expect(describePaymentMethod({ ...NO_METHOD, manualReference: "UTR123" })).toBe("Recorded by hand, reference UTR123");
    expect(describePaymentMethod(NO_METHOD)).toBeNull();
  });
});

describe("planStatusTeamsCard", () => {
  const base = {
    providerStatus: "pending",
    customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
    business: { name: "Rao Clinic", websiteUrl: null },
    paidThrough: new Date("2026-11-26T12:24:17.000Z"),
    consoleUrl: "https://console.example/clients/biz-1",
  } as const;

  it("names the problem, the customer, when access ends and where to open them", () => {
    const card = JSON.stringify(planStatusTeamsCard({ ...base, status: "past_due" }));
    for (const part of ["Payment failed, Razorpay is retrying: Rao Clinic", "Asha Rao", "asha@example.com", "pending", "26 Nov 2026", "Open the client"]) expect(card).toContain(part);
  });

  it("words each of the three states differently", () => {
    const titles = (["past_due", "inactive", "cancelled"] as const).map((status) => JSON.stringify(planStatusTeamsCard({ ...base, status })));
    expect(new Set(titles).size).toBe(3);
    expect(titles[1]).toContain("Billing stopped");
    expect(titles[2]).toContain("Plan ended");
  });
});
