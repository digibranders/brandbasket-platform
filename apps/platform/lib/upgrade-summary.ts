import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { UpgradeQuote } from "@brandbasket/shared/lib/billing/upgrade";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/*
 * The "You pay today" lines on the Upgrade page: the price, the GST on it and the total taken. Formatted here, on the
 * server, so the page's client code only draws strings and never works out money. Browser-safe and pure.
 */

export interface PaymentSummary {
  /** Before tax and before any code. */
  readonly price: string;
  /** What a coupon or affiliate code takes off, or null when none is applied. */
  readonly discount: string | null;
  /** The tax line, or null for a plan that carries none or a payment with nothing to take. */
  readonly tax: { readonly label: string; readonly amount: string } | null;
  /** What the provider takes today, tax included: the figure the Pay button shows. */
  readonly total: string;
}

interface Taxed {
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
}

/** "GST 18%": the only tax a plan carries. */
function gstLabel(taxRateBasisPoints: number): string {
  return `GST ${taxRateBasisPoints / 100}%`;
}

/**
 * What a plan's first payment takes: its initial price, a code's discount, the GST on what is left, and the total (the
 * figure the checkout charges, worked out by the same function it is frozen with).
 */
export function planPaymentSummary(plan: Taxed & { readonly initialAmountCents: number }, discountCents = 0): PaymentSummary {
  const total = chargedAmountCents(plan.initialAmountCents, discountCents, plan.taxRateBasisPoints);
  const taxable = plan.initialAmountCents - discountCents;
  return {
    price: formatMoney(plan.initialAmountCents, plan.currency),
    discount: discountCents === 0 ? null : formatMoney(discountCents, plan.currency),
    tax:
      plan.taxRateBasisPoints === 0
        ? null
        : { label: gstLabel(plan.taxRateBasisPoints), amount: formatMoney(total - taxable, plan.currency) },
    total: formatMoney(total, plan.currency),
  };
}

/** What moving a Care client up takes today: the difference for the days left, the GST on it, and the total. */
export function upgradePaymentSummary(quote: UpgradeQuote, plan: Taxed): PaymentSummary {
  const price = formatMoney(quote.netDifferenceCents, plan.currency);
  // Too small for the provider to take: the move is applied with nothing charged, so there is no tax to show either.
  if (quote.free) return { price, discount: null, tax: null, total: "Nothing" };
  return {
    price,
    discount: null,
    tax:
      plan.taxRateBasisPoints === 0
        ? null
        : { label: gstLabel(plan.taxRateBasisPoints), amount: formatMoney(quote.chargeCents - quote.netDifferenceCents, plan.currency) },
    total: formatMoney(quote.chargeCents, plan.currency),
  };
}
