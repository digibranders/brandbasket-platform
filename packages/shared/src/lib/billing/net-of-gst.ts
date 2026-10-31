/** GST on a rupee price that includes it (docs/plans/25-money-gst-and-offers.md): 18 percent of the net, so 18/118 of the whole. */
const GST_SHARE_OF_PRICE = 18 / 118;

/**
 * A payment's money without its GST: what ad platforms are told a sale is worth and what the ad results table adds up (plan
 * 59), so return on ad spend is not overstated by the tax that goes to the government. The tax invoice's own figure is used when
 * there is one; a rupee payment without an invoice has it worked out from the price. A dollar payment carries no GST.
 */
export function netOfGstCents(input: { readonly amountCents: number; readonly currency: "INR" | "USD"; readonly gstCents: number | null }): number {
  if (input.currency === "USD") return input.amountCents;
  const gst = input.gstCents ?? Math.round(input.amountCents * GST_SHARE_OF_PRICE);
  return Math.max(0, input.amountCents - gst);
}
