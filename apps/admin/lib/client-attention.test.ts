import { describe, expect, it } from "vitest";
import { attentionSection } from "./client-attention";

const none = { flaggedCount: 0, previewIsLate: false, missingInvoiceCount: 0 };

describe("the one attention section on a client page", () => {
  it("is none when nothing is wrong", () => {
    expect(attentionSection(none)).toBeNull();
  });

  it.each([
    [{ flaggedCount: 2 }, "payments"],
    [{ previewIsLate: true }, "preview"],
    [{ missingInvoiceCount: 1 }, "invoices"],
  ] as const)("is the only thing wrong: %j", (wrong, expected) => {
    expect(attentionSection({ ...none, ...wrong })).toBe(expected);
  });

  it("gives a late preview the mark when an invoice is also missing, so the invoice section stays plain", () => {
    expect(attentionSection({ flaggedCount: 0, previewIsLate: true, missingInvoiceCount: 1 })).toBe("preview");
  });

  it("puts flagged payments before a late preview, and a late preview before a missing invoice", () => {
    expect(attentionSection({ flaggedCount: 1, previewIsLate: true, missingInvoiceCount: 3 })).toBe("payments");
    expect(attentionSection({ flaggedCount: 0, previewIsLate: true, missingInvoiceCount: 3 })).toBe("preview");
  });
});
