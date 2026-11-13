/*
 * What the receipts and payment screens name the seller and where they send questions. Ported from apps/platform
 * lib/brand.ts, keeping only what checkout reads. One product, one brand. Browser-safe and pure.
 */
export interface Brand {
  /** The company's name in full. */
  readonly name: string;
  /** Where a person writes to for help. */
  readonly contactEmail: string;
}

export const BRAND: Brand = { name: "Brandbasket", contactEmail: "support@brandbasket.in" };
