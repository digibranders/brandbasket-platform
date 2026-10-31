import { netOfGstCents } from "@brandbasket/shared/lib/billing/net-of-gst";

/**
 * What a first payment is worth to an ad platform (plan 59): the money without the GST. The rule lives in shared, because the
 * console's ad results add up the same figure.
 */
export const conversionValueCents = netOfGstCents;
