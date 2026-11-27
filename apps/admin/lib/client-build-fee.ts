import type { BillingCurrency } from "@brandbasket/db";
import { WEBSITE_KIND_LABELS, isWebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { formatMoney } from "@brandbasket/shared/lib/money";

/** The kind of website as staff read it. A project or subscription that predates kinds (null) is a B2B website, as D15 of plan 65 says. */
export function websiteKindLabel(kind: string | null): string {
  return WEBSITE_KIND_LABELS[kind !== null && isWebsiteKind(kind) ? kind : "b2b"];
}

/** The frozen deal columns of a subscription: what the first payment's build fee was. */
export interface BuildFeeColumns {
  readonly websiteKind: string | null;
  readonly setupFeeListCents: number | null;
  readonly setupFeeDiscountCents: number | null;
  readonly setupFeeNote: string | null;
  readonly paymentLinkId: string | null;
}

export interface BuildFeeFact {
  readonly label: string;
  readonly value: string;
}

/**
 * What client billing shows about the one-time build fee, read from the subscription's frozen columns, or null when no fee was owed.
 * A waived fee still shows (list fee, the whole fee off, nothing to pay) because the invoice says it was waived.
 */
export function buildFeeFacts(subscription: BuildFeeColumns | null, currency: BillingCurrency): readonly BuildFeeFact[] | null {
  if (subscription === null || subscription.setupFeeListCents === null) return null;
  const list = subscription.setupFeeListCents;
  const discount = subscription.setupFeeDiscountCents ?? 0;
  return [
    { label: "Website", value: websiteKindLabel(subscription.websiteKind) },
    { label: "Build fee", value: formatMoney(list, currency) },
    { label: "Discount", value: discount === 0 ? "None" : discount === list ? `${formatMoney(discount, currency)} (fee waived)` : formatMoney(discount, currency) },
    { label: "Paid for the build", value: formatMoney(list - discount, currency) },
    ...(subscription.setupFeeNote === null ? [] : [{ label: "Note", value: subscription.setupFeeNote }]),
    { label: "Came from", value: subscription.paymentLinkId === null ? "The public checkout" : "A staff payment link" },
  ];
}
