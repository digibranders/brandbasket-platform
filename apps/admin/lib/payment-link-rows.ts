import { type BillingProviderName, type PaymentLink, type PaymentLinkState, type ReferralCode, paymentLinkState } from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { WEBSITE_KIND_LABELS, isWebsiteKind, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { customPricesOf, summariseLink } from "./payment-link-summary";

/** One row of the Payment links list, with everything already worked out so the page only draws it. */
export interface PaymentLinkRow {
  readonly id: string;
  /** The business, else the contact, else the email: whatever staff filled in to tell links apart. */
  readonly customer: string;
  /** "Website Management (Ecommerce store), Social Media Management". */
  readonly services: string;
  readonly interval: "month" | "year";
  /** "free deal" or "paid deal". */
  readonly deal: string;
  /** What the customer pays on opening the link (the advance of a paid deal), or null when the stored deal no longer prices (a coupon that was retired). */
  readonly payToday: string | null;
  /** A paid deal's balance at go-live: what is left of the build price after the advance. Null for a free deal. */
  readonly balance: string | null;
  readonly state: PaymentLinkState;
  readonly expiresAt: string;
  readonly createdBy: string;
  readonly createdAt: string;
  /** Cancel and Extend are offered on an open or an expired link. */
  readonly canChange: boolean;
}

export const PAYMENT_LINK_STATE_LABELS: Readonly<Record<PaymentLinkState, string>> = {
  open: "Open",
  paid: "Paid",
  revoked: "Cancelled",
  expired: "Expired",
  building: "Building",
  balance_due: "Balance due",
};

export function paymentLinkServices(services: readonly string[], websiteKind: WebsiteKind | null): string {
  return services
    .filter((id): id is MonthlyAddOnId => isMonthlyAddOnId(id))
    .map((id) => {
      const title = addOnById(id).title;
      return id === "managed-website" && websiteKind !== null ? `${title} (${WEBSITE_KIND_LABELS[websiteKind]})` : title;
    })
    .join(", ");
}

export function toPaymentLinkRow(
  link: PaymentLink,
  context: { readonly now: Date; readonly provider: BillingProviderName; readonly coupon: ReferralCode | null; readonly createdBy: string },
): PaymentLinkRow {
  const state = paymentLinkState(link, context.now);
  const websiteKind = link.websiteKind !== null && isWebsiteKind(link.websiteKind) ? link.websiteKind : null;
  const interval = link.billingInterval === "year" ? "year" : "month";
  const services = link.services.filter((id): id is MonthlyAddOnId => isMonthlyAddOnId(id));
  const paid = link.dealType === "paid" && link.setupFeeListCents !== null && link.advanceCents !== null;
  const summary = summariseLink({
    services,
    interval,
    currency: link.currency,
    websiteKind,
    build: paid ? { listCents: link.setupFeeListCents ?? 0, discountCents: link.setupFeeDiscountCents ?? 0, advanceCents: link.advanceCents ?? 0 } : null,
    customPrices: customPricesOf(link),
    coupon: context.coupon === null || context.coupon.discount === null ? null : { discount: context.coupon.discount, discountMonths: context.coupon.discountMonths },
    provider: context.provider,
  });
  return {
    id: link.id,
    customer: link.businessName ?? link.contactName ?? link.email ?? "Details not filled in",
    services: paymentLinkServices(link.services, websiteKind),
    interval,
    deal: paid ? "paid deal" : "free deal",
    payToday: summary.kind === "priced" ? formatMoney(summary.payTodayCents, link.currency) : null,
    balance: summary.kind === "priced" && summary.deal !== null ? formatMoney(summary.deal.balanceCents, link.currency) : null,
    state,
    expiresAt: link.expiresAt.toISOString(),
    createdBy: context.createdBy,
    createdAt: link.createdAt.toISOString(),
    canChange: state === "open" || state === "expired",
  };
}
