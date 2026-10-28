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
  attentionReason: null,
  paymentNumber: 1,
  provider: "razorpay",
  providerPaymentId: "pay_Qx123",
  method: { ...NO_METHOD, method: "upi", upiVpa: "asha@okhdfc" },
  customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
  business: { name: "Rao Clinic", websiteUrl: "https://raoclinic.in" },
  services: ["Managed Website", "Social Media and Ads"],
  invoice: { number: "BB/2026-27/0001", gstCents: 178_460 },
  consoleUrl: "https://console.example/clients/biz-1",
};

describe("paymentTeamsCard", () => {
  it("calls a new customer's first payment out, with who paid, how to reach them and what for", () => {
    const card = parts(BASE);
    expect(card.body[0]?.text).toBe("New customer paid: ₹11,699");
    expect(card.body[1]?.text).toBe("Rao Clinic, first payment");
    expect(facts(BASE)).toEqual({
      Customer: "Asha Rao",
      Mobile: "+91 98200 11111",
      Email: "asha@example.com",
      Website: "https://raoclinic.in",
      Paid: "₹11,699 (₹1,784.60 GST inside)",
      Bought: "Managed Website, Social Media and Ads",
      "Paid with": "UPI (asha@okhdfc)",
      Invoice: "BB/2026-27/0001",
    });
    expect(card.actions).toEqual([
      { type: "Action.OpenUrl", title: "Open the client", url: "https://console.example/clients/biz-1" },
      { type: "Action.OpenUrl", title: "Call now", url: "tel:+919820011111" },
    ]);
  });

  it("names a repeat payment by its kind", () => {
    const renewal = { ...BASE, kind: "renewal" as const, paymentNumber: 4 };
    expect(parts(renewal).body[0]?.text).toBe("Renewal received: ₹11,699");
    for (const [kind, title] of [["reactivation", "Reactivation received"], ["add_on", "Add-on payment received"], ["charge", "One-off charge received"]] as const) {
      expect(parts({ ...renewal, kind }).body[0]?.text).toBe(`${title}: ₹11,699`);
    }
  });

  it("says plainly when money arrived that bought nothing, with why, and the provider id to refund it by", () => {
    const stuck = { ...BASE, attentionReason: "already_paid" };
    const card = parts(stuck);
    expect(card.body[0]?.text).toBe("Payment needs attention: ₹11,699");
    expect(card.body[1]?.text).toBe("Rao Clinic");
    expect(card.body.at(-1)?.text).toBe("The business already had access, so this is a duplicate charge to refund. Nothing was activated.");
    expect(facts(stuck)["Provider id"]).toBe("razorpay pay_Qx123");
  });

  it("keeps a payment that applied but needs a follow-up as a normal payment, with the follow-up as the note", () => {
    const pending = { ...BASE, kind: "add_on" as const, attentionReason: "add_on_provider_pending" };
    const card = parts(pending);
    expect(card.body[0]?.text).toBe("Add-on payment received: ₹11,699");
    expect(card.body.at(-1)?.text).toContain("not yet been told to bill it");
    expect(facts(pending)).not.toHaveProperty("Provider id");
  });

  it("writes dollars without GST, and leaves out what is not known", () => {
    const usd = { ...BASE, currency: "USD" as const, amountCents: 19_400, invoice: null, customer: { name: null, email: "asha@example.com", phone: null }, business: { name: "Rao Clinic", websiteUrl: null }, method: NO_METHOD };
    expect(parts(usd).body[0]?.text).toBe("New customer paid: $194");
    expect(facts(usd)).toEqual({ Email: "asha@example.com", Paid: "$194", Bought: "Managed Website, Social Media and Ads" });
    expect(parts(usd).actions?.map((action) => action.title)).toEqual(["Open the client"]);
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
    providerStatus: "cancelled",
    customer: { name: "Asha Rao", email: "asha@example.com", phone: "+91 98200 11111" },
    business: { name: "Rao Clinic", websiteUrl: null },
    paidThrough: new Date("2026-11-26T12:24:17.000Z"),
    consoleUrl: "https://console.example/clients/biz-1",
  } as const;

  it("names the plan, the customer, when access ends and where to open them", () => {
    const card = JSON.stringify(planStatusTeamsCard({ ...base, status: "cancelled" }));
    for (const part of ["Plan ended: Rao Clinic", "Asha Rao", "asha@example.com", "cancelled", "26 Nov 2026", "Open the client"]) expect(card).toContain(part);
  });

  it("has a Call button for the customer's number", () => {
    const actions = (planStatusTeamsCard({ ...base, status: "cancelled" }).attachments[0].content as { actions: { title: string; url: string }[] }).actions;
    expect(actions.map((action) => action.title)).toEqual(["Open the client", "Call now"]);
    expect(actions[1]?.url).toBe("tel:+919820011111");
  });
});
