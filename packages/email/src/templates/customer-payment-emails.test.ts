import { describe, expect, it } from "vitest";
import { firstChargeReminderEmail } from "./first-charge-reminder";
import { paymentFailedEmail } from "./payment-failed";
import { paymentReceivedEmail } from "./payment-received";
import { paymentRefundedEmail } from "./payment-refunded";
import { CHANGES_QUOTE_LIMIT, clampChangesText, previewChangesReceivedEmail } from "./preview-changes-received";


const DASH = /[–—]/;
const RECEIPT_URL = "https://app.brandbasket.in/billing/receipts?ids=0192f3c4-0000-7000-8000-000000000001";

describe("paymentReceivedEmail", () => {
  const inr = {
    to: "asha@example.com",
    name: "Asha Rao",
    currency: "INR",
    amountCents: 299_900,
    items: ["Managed Website"],
    gstRatePercent: 18,
    paidThrough: new Date("2026-11-27T05:00:00Z"),
    nextPayment: { amountCents: 299_900, on: new Date("2026-11-27T05:00:00Z") },
    receiptUrl: RECEIPT_URL,
  } as const;

  it("says the amount in the subject and writes the approved body in order", () => {
    const email = paymentReceivedEmail(inr);
    expect(email.subject).toBe("Payment received: ₹2,999");
    expect(email.template).toBe("payment-received");
    expect(email.bodyText).toBe(
      [
        "Hi Asha,",
        "We have received your payment of ₹2,999 for Managed Website.",
        "Includes GST at 18%.",
        "Your plan is paid up to 27 November 2026. Your next payment of ₹2,999 is taken on 27 November 2026.",
        `Download your receipt: ${RECEIPT_URL}`,
        "Brandbasket",
      ].join("\n\n"),
    );
  });

  it("links the receipt in the html and carries the same words", () => {
    const email = paymentReceivedEmail(inr);
    expect(email.bodyHtml).toContain(`href="${RECEIPT_URL}"`);
    for (const part of ["We have received your payment of ₹2,999 for Managed Website.", "Includes GST at 18%.", "Your plan is paid up to 27 November 2026."]) {
      expect(email.bodyHtml).toContain(part);
    }
  });

  it("names several services in a list", () => {
    const email = paymentReceivedEmail({ ...inr, items: ["Managed Website", "Social Media and Ads", "Local SEO"] });
    expect(email.bodyText).toContain("for Managed Website, Social Media and Ads and Local SEO.");
  });

  it("speaks dollars to a USD customer and never mentions GST", () => {
    const email = paymentReceivedEmail({ ...inr, currency: "USD", amountCents: 6_500, nextPayment: { amountCents: 6_500, on: new Date("2026-11-27T05:00:00Z") } });
    expect(email.subject).toBe("Payment received: $65");
    expect(email.bodyText).toContain("Your next payment of $65 is taken on 27 November 2026.");
    expect(email.bodyText).not.toMatch(/GST/i);
    expect(email.bodyHtml).not.toMatch(/GST/i);
  });

  it("keeps decimals when the amount is not whole", () => {
    expect(paymentReceivedEmail({ ...inr, amountCents: 353_882 }).subject).toBe("Payment received: ₹3,538.82");
  });

  it("leaves out the GST line when the invoice carried no rate", () => {
    expect(paymentReceivedEmail({ ...inr, gstRatePercent: null }).bodyText).not.toContain("GST");
  });

  it("leaves out the plan line when nothing is known, and the next payment alone when there is none", () => {
    const bare = paymentReceivedEmail({ ...inr, paidThrough: null, nextPayment: null });
    expect(bare.bodyText).not.toContain("paid up to");
    expect(bare.bodyText).not.toContain("next payment");
    const noNext = paymentReceivedEmail({ ...inr, nextPayment: null });
    expect(noNext.bodyText).toContain("Your plan is paid up to 27 November 2026.");
    expect(noNext.bodyText).not.toContain("next payment");
  });

  it("drops the 'for' part when it has no names, and the first name when it has no name", () => {
    const email = paymentReceivedEmail({ ...inr, items: [], name: null });
    expect(email.bodyText).toContain("Hello,");
    expect(email.bodyText).toContain("We have received your payment of ₹2,999.\n\n");
  });

  it("escapes what a charge description or a name could carry", () => {
    const email = paymentReceivedEmail({ ...inr, items: ['<script>alert("x")</script>'], name: "<i>Asha</i>" });
    expect(email.bodyHtml).not.toContain("<script>");
    expect(email.bodyHtml).not.toContain("<i>Asha</i>");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
  });

  it("refuses a link that is not a web address and an amount that is not whole minor units", () => {
    expect(() => paymentReceivedEmail({ ...inr, receiptUrl: "javascript:alert(1)" })).toThrow("receiptUrl");
    expect(() => paymentReceivedEmail({ ...inr, amountCents: 10.5 })).toThrow(RangeError);
  });

  it("uses no dashes as punctuation, no exclamation marks and no emoji", () => {
    const email = paymentReceivedEmail(inr);
    for (const text of [email.subject, email.bodyText]) {
      expect(text).not.toMatch(DASH);
      expect(text).not.toContain("!");
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("paymentFailedEmail", () => {
  const base = {
    to: "asha@example.com",
    name: "Asha Rao",
    currency: "INR",
    amountCents: 299_900,
    items: ["Managed Website", "Social Media and Ads"],
    plan: { state: "active", until: new Date("2026-11-27T05:00:00Z") },
    payUrl: "https://app.brandbasket.in/billing",
  } as const;

  it("writes the approved body in order for a plan that still runs", () => {
    const email = paymentFailedEmail(base);
    expect(email.subject).toBe("Your payment did not go through");
    expect(email.template).toBe("payment-failed");
    expect(email.bodyText).toBe(
      [
        "Hi Asha,",
        "We could not take your payment of ₹2,999 for Managed Website and Social Media and Ads.",
        "Your plan stays active until 27 November 2026. After that it pauses until the payment is made.",
        "Pay now: https://app.brandbasket.in/billing",
        "If you need help, reply to this email.",
        "Brandbasket",
      ].join("\n\n"),
    );
    expect(email.bodyHtml).toContain('href="https://app.brandbasket.in/billing"');
  });

  it("says the plan is paused when it is already past its paid date", () => {
    const email = paymentFailedEmail({ ...base, plan: { state: "paused" } });
    expect(email.bodyText).toContain("Your plan is paused until the payment is made.");
    expect(email.bodyText).not.toContain("stays active");
  });

  it("says nothing about the plan when there is none to speak of", () => {
    const email = paymentFailedEmail({ ...base, plan: null, items: [] });
    expect(email.bodyText).not.toContain("plan");
    expect(email.bodyText).toContain("We could not take your payment of ₹2,999.");
  });

  it("speaks dollars to a USD customer", () => {
    const email = paymentFailedEmail({ ...base, currency: "USD", amountCents: 15_000 });
    expect(email.bodyText).toContain("payment of $150 for");
    expect(email.bodyText).not.toMatch(/GST|₹/);
  });

  it("escapes names and refuses a link that is not a web address", () => {
    expect(paymentFailedEmail({ ...base, items: ["<b>x</b>"] }).bodyHtml).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(() => paymentFailedEmail({ ...base, payUrl: "javascript:1" })).toThrow("payUrl");
  });

  it("uses no dashes as punctuation", () => {
    const email = paymentFailedEmail(base);
    expect(`${email.subject}${email.bodyText}`).not.toMatch(DASH);
  });
});

describe("firstChargeReminderEmail", () => {
  const input = {
    to: "asha@example.com",
    name: "Asha Rao",
    currency: "INR" as const,
    amountCents: 299_900,
    chargeDate: new Date("2026-11-27T05:00:00Z"),
    items: ["Managed Website"],
    billingUrl: "https://app.brandbasket.in/billing/payment",
    businessId: "biz-1",
  };

  it("states the amount and date in the subject and body without em or en dashes", () => {
    const email = firstChargeReminderEmail(input);
    expect(email.template).toBe("first-charge-reminder");
    expect(email.subject).toBe("Upcoming renewal: ₹2,999 on 27 November 2026");
    expect(email.bodyText).toContain("Hi Asha,");
    expect(email.bodyText).toContain("Your next payment of ₹2,999 for Managed Website will be taken on 27 November 2026.");
    expect(email.bodyText).toContain("https://app.brandbasket.in/billing/payment");
    expect(email.bodyHtml).toContain("₹2,999");
    expect(email.bodyHtml).toContain("27 November 2026");
    expect(`${email.subject}${email.bodyText}${email.bodyHtml}`).not.toMatch(DASH);
  });
});

describe("previewChangesReceivedEmail", () => {
  const base = { to: "asha@example.com", name: "Asha Rao", round: 1, rounds: 2, text: "Make the logo bigger.\nChange the phone number.", readyBy: "Thu 5 Nov" } as const;

  it("writes the approved body in order, quoting the customer", () => {
    const email = previewChangesReceivedEmail(base);
    expect(email.subject).toBe("We got your changes");
    expect(email.template).toBe("preview-changes-received");
    expect(email.bodyText).toBe(
      [
        "Hi Asha,",
        "We have your changes for round 1 of 2:",
        "> Make the logo bigger.\n> Change the phone number.",
        "We will email you when the new preview is ready, by Thu 5 Nov.",
        "Brandbasket",
      ].join("\n\n"),
    );
    expect(email.bodyHtml).toContain("Make the logo bigger.");
    expect(email.bodyHtml).toContain("by Thu 5 Nov.");
  });

  it("leaves the ready-by sentence out when there is no date", () => {
    const email = previewChangesReceivedEmail({ ...base, readyBy: null });
    expect(email.bodyText).not.toContain("We will email you");
    expect(email.bodyHtml).not.toContain("We will email you");
  });

  it("escapes what the customer wrote", () => {
    const email = previewChangesReceivedEmail({ ...base, text: '<img src=x onerror="alert(1)"> & more' });
    expect(email.bodyHtml).not.toContain("<img src=x");
    expect(email.bodyHtml).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; more");
  });

  it("rejects a round that is not a whole number", () => {
    expect(() => previewChangesReceivedEmail({ ...base, round: 0 })).toThrow(RangeError);
    expect(() => previewChangesReceivedEmail({ ...base, rounds: 1.5 })).toThrow(RangeError);
  });

  it("uses no dashes as punctuation", () => {
    const email = previewChangesReceivedEmail(base);
    expect(`${email.subject}${email.bodyText}`).not.toMatch(DASH);
  });
});

describe("paymentRefundedEmail", () => {
  const BILLING_URL = "https://app.brandbasket.in/billing#payments";

  const fullRefundInput = {
    to: "asha@example.com",
    name: "Asha Rao",
    currency: "INR" as const,
    refundedAmountCents: 299_900,
    originalAmountCents: 299_900,
    items: ["Managed Website"],
    creditNoteNumber: "CN/26-27/000001",
    billingUrl: BILLING_URL,
  };

  it("says the refunded amount in the subject and writes the approved full refund body", () => {
    const email = paymentRefundedEmail(fullRefundInput);
    expect(email.subject).toBe("Refund processed: ₹2,999");
    expect(email.template).toBe("payment-refunded");
    expect(email.bodyText).toBe(
      [
        "Hi Asha,",
        "We have processed a full refund of ₹2,999 for Managed Website.",
        "A credit note has been issued under number CN/26-27/000001.",
        "The refund has been sent back to your original payment method. Depending on your bank or card issuer, it usually appears on your statement in 5 to 10 business days.",
        `View billing details: ${BILLING_URL}`,
        "Brandbasket",
      ].join("\n\n"),
    );
  });

  it("formats a partial refund with the original payment amount", () => {
    const email = paymentRefundedEmail({
      ...fullRefundInput,
      refundedAmountCents: 100_000,
    });
    expect(email.subject).toBe("Refund processed: ₹1,000");
    expect(email.bodyText).toContain("We have processed a partial refund of ₹1,000 for Managed Website (original payment of ₹2,999).");
  });

  it("renders html with a button linking to billingUrl", () => {
    const email = paymentRefundedEmail(fullRefundInput);
    expect(email.bodyHtml).toContain(`href="${BILLING_URL}"`);
    expect(email.bodyHtml).toContain("Refund processed: ₹2,999");
    expect(email.bodyHtml).toContain("A credit note has been issued under number CN/26-27/000001.");
  });

  it("contains no em or en dashes in subject or body", () => {
    const email = paymentRefundedEmail(fullRefundInput);
    expect(email.subject).not.toMatch(DASH);
    expect(email.bodyText).not.toMatch(DASH);
    expect(email.bodyHtml).not.toMatch(DASH);
  });

  it("validates inputs", () => {
    expect(() => paymentRefundedEmail({ ...fullRefundInput, refundedAmountCents: 0 })).toThrow(RangeError);
    expect(() => paymentRefundedEmail({ ...fullRefundInput, billingUrl: "not-a-url" })).toThrow(/must be an absolute http or https URL/);
  });

});

describe("clampChangesText", () => {

  it("leaves text of exactly 300 characters whole, with no ellipsis", () => {
    const text = "a".repeat(CHANGES_QUOTE_LIMIT);
    expect(clampChangesText(text)).toBe(text);
  });

  it("cuts longer text to 300 characters and adds one ellipsis", () => {
    const cut = clampChangesText("a".repeat(CHANGES_QUOTE_LIMIT + 50));
    expect(cut).toBe(`${"a".repeat(CHANGES_QUOTE_LIMIT)}…`);
  });

  it("never splits an emoji or other character made of two code units", () => {
    const cut = clampChangesText("😀".repeat(CHANGES_QUOTE_LIMIT + 1));
    expect(Array.from(cut)).toHaveLength(CHANGES_QUOTE_LIMIT + 1);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("trims surrounding space before it counts", () => {
    expect(clampChangesText("  hello  ")).toBe("hello");
  });
});
