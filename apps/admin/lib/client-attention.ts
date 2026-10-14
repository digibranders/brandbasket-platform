export type AttentionSection = "payments" | "preview" | "invoices";

interface AttentionFacts {
  /** Payments flagged for staff on this client. */
  readonly flaggedCount: number;
  /** The Send a preview step is showing and its promised date has passed. */
  readonly previewIsLate: boolean;
  /** Captured rupee payments with no tax invoice (0 when the client is not invoiced). */
  readonly missingInvoiceCount: number;
}

/**
 * Which section of a client page carries the one "needs attention" mark (DESIGN.md allows a single one), or null.
 * Money first, then the preview we owe, then a missing invoice. Every section that can carry the mark asks here, so
 * two of them can never both claim it.
 */
export function attentionSection({ flaggedCount, previewIsLate, missingInvoiceCount }: AttentionFacts): AttentionSection | null {
  if (flaggedCount > 0) return "payments";
  if (previewIsLate) return "preview";
  if (missingInvoiceCount > 0) return "invoices";
  return null;
}
