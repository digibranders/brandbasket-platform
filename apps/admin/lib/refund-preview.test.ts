import { paymentRefundedEmail } from "@brandbasket/email";
import { describe, expect, it } from "vitest";
import { refundPreview, REFUND_SETTLEMENT_LINE, REFUND_STAYS_ACTIVE_LINE, type RefundPreview, type RefundPreviewInput } from "./refund-preview";

function must(input: RefundPreviewInput): RefundPreview {
  const preview = refundPreview(input);
  if (preview === null) throw new Error("Expected a refund preview");
  return preview;
}

const BASE = { currency: "INR", paymentCents: 299_900, invoiceNumber: "FY/26-27/000029" } as const;

describe("refundPreview", () => {
  it("describes a full refund, the credit note and the customer email", () => {
    const preview = must({ ...BASE, refundCents: 299_900, reason: "Charged twice" });
    expect(preview.isFull).toBe(true);
    expect(preview.subject).toBe("Refund processed: ₹2,999");
    expect(preview.emailLines).toContain("We have processed a full refund of ₹2,999.");
    expect(preview.emailLines).toContain("Reason: Charged twice");
    expect(preview.creditNote).toBe("A GST credit note will be issued against invoice FY/26-27/000029.");
    expect(preview.consequence).toBe(
      "₹2,999 goes back to the customer through the payment provider, a credit note is issued and the customer is emailed. This cannot be undone.",
    );
  });

  it("describes a partial refund with the original amount", () => {
    const preview = must({ ...BASE, refundCents: 100_000, reason: "Goodwill" });
    expect(preview.isFull).toBe(false);
    expect(preview.emailLines).toContain("We have processed a partial refund of ₹1,000 (original payment of ₹2,999).");
  });

  it("says there is no credit note when the payment has no tax invoice, and leaves the reason line out when empty", () => {
    const preview = must({ ...BASE, invoiceNumber: null, refundCents: 299_900, reason: "  " });
    expect(preview.creditNote).toBe("No credit note, because this payment has no tax invoice.");
    expect(preview.emailLines.some((line) => line.startsWith("Reason:"))).toBe(false);
  });

  it("keeps the sentences the real email sends, so the preview cannot drift from it", () => {
    const sent = paymentRefundedEmail({
      to: "owner@example.test",
      name: "Asha Rao",
      currency: "INR",
      refundedAmountCents: 100_000,
      originalAmountCents: 299_900,
      items: [],
      reason: "Goodwill",
      creditNoteNumber: "CN/26-27/000001",
      billingUrl: "https://app.example.test/billing",
    });
    expect(sent.bodyText).toContain(REFUND_SETTLEMENT_LINE);
    expect(sent.bodyText).toContain("We have processed a partial refund of ₹1,000 (original payment of ₹2,999).");
    expect(sent.subject).toBe("Refund processed: ₹1,000");
    expect(must({ ...BASE, refundCents: 100_000, reason: "Goodwill" }).emailLines).toContain(REFUND_SETTLEMENT_LINE);
  });

  it("says nothing else changes, which is what the refund really does", () => {
    expect(REFUND_STAYS_ACTIVE_LINE).toBe("The plan and the website are not changed by a refund. Cancel the plan separately if the customer is leaving.");
  });

  it("returns null for an amount that is not a refund of this payment", () => {
    expect(refundPreview({ ...BASE, refundCents: 0, reason: "x" })).toBeNull();
    expect(refundPreview({ ...BASE, refundCents: 300_000, reason: "x" })).toBeNull();
  });
});
