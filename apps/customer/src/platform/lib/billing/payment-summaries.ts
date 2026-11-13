import type { BillingInterval } from "@brandbasket/db";
import { perCycle } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { gstNote, type PaymentSummary, type PaymentSummaryRow } from "./payment-summary";

/*
 * What each button that takes money confirms (components/panel/confirm-payment.tsx), built from the same figures the payment
 * is made from. The rows, the total and the notes are worded here, so a dialog never works anything out.
 */

/** A service of a basket at what a cycle of it costs, GST included. */
export interface SummaryService {
  readonly key: string;
  readonly title: string;
  readonly netCents: number;
}

function serviceRows(services: readonly SummaryService[], discountCents: number, currency: MoneyCurrency): PaymentSummaryRow[] {
  const rows: PaymentSummaryRow[] = services.map((service) => ({ key: service.key, label: service.title, amount: formatMoney(service.netCents, currency), tone: "plain" }));
  if (discountCents > 0) rows.push({ key: "code", label: "Your code", amount: `-${formatMoney(discountCents, currency)}`, tone: "save" });
  return rows;
}

/**
 * Pay on an open charge. `label` and `amount` are the words and figure the charge is listed with; the GST note is given only when the
 * charge carries tax (`taxRateBasisPoints` above 0). Left out, the rate is not known and the note stays, as it always was.
 */
export function chargeSummary(label: string, amount: string, currency: MoneyCurrency, taxRateBasisPoints?: number): PaymentSummary {
  const taxed = taxRateBasisPoints === undefined || taxRateBasisPoints > 0;
  return {
    title: "Pay this charge",
    rows: [{ key: "charge", label, amount, tone: "plain" }],
    totalLabel: "Due today",
    total: amount,
    notes: ["A one-off payment.", ...(taxed ? gstNote(currency) : [])],
  };
}

/** Unlock more posts: the next block of posts at its price (GST included, formatted). */
export function unlockPostsSummary(block: { readonly posts: number; readonly price: string; readonly currency: MoneyCurrency }): PaymentSummary {
  const noun = block.posts === 1 ? "blog post" : "blog posts";
  return {
    title: "Unlock more posts",
    rows: [{ key: "posts", label: `${block.posts.toLocaleString("en-IN")} more ${noun}`, amount: block.price, tone: "plain" }],
    totalLabel: "Due today",
    total: block.price,
    notes: ["A one-off payment. The posts unlock as soon as it is confirmed.", ...gstNote(block.currency)],
  };
}

/** Accepting or paying a request's quote: the quote's line and total, with its GST note when it has one. */
export function quoteSummary(quote: { readonly line: string; readonly total: string }, gst: readonly string[] = []): PaymentSummary {
  return { title: "Pay for this change", rows: [{ key: "quote", label: quote.line, amount: quote.total, tone: "plain" }], totalLabel: "Due today", total: quote.total, notes: gst };
}

interface ReactivationFacts {
  readonly services: readonly SummaryService[];
  readonly discountCents: number;
  /** What a cycle takes, formatted: the figure on the button. */
  readonly total: string;
  readonly currency: MoneyCurrency;
  readonly interval: BillingInterval;
  /** The day the next payment falls, formatted. */
  readonly renewsOn: string;
}

/** Reactivating a lapsed plan: each service at its price, the code, and what is taken today. */
export function reactivationSummary(facts: ReactivationFacts): PaymentSummary {
  return {
    title: "Reactivate your plan",
    rows: serviceRows(facts.services, facts.discountCents, facts.currency),
    totalLabel: "Due today",
    total: facts.total,
    notes: [`It renews ${perCycle(facts.interval)} from ${facts.renewsOn}.`, ...gstNote(facts.currency)],
  };
}

interface KeepPlanFacts {
  readonly services: readonly SummaryService[];
  readonly discountCents: number;
  /** What the first payment takes, formatted: the next renewal's amount. */
  readonly total: string;
  readonly currency: MoneyCurrency;
  readonly interval: BillingInterval;
  /** The day the paid time ends and the first payment falls, formatted. */
  readonly firstPaymentOn: string;
}

/** Keep my plan: the services at the price they go on billing at, and the first payment, which is not taken today. */
export function keepPlanSummary(facts: KeepPlanFacts): PaymentSummary {
  return {
    title: "Keep your plan",
    rows: serviceRows(facts.services, facts.discountCents, facts.currency),
    totalLabel: `First payment on ${facts.firstPaymentOn}`,
    total: facts.total,
    notes: ["Nothing is taken today.", `Then it renews ${perCycle(facts.interval)}.`, ...gstNote(facts.currency)],
  };
}
