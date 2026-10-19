import { isUnappliedReason, type BillingCurrency, type Charge, type Receipt } from "@brandbasket/db";
import { BRAND, type Brand } from "@/lib/brand";
import { chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { receiptRows, type ReceiptRow } from "./receipt-rows";

/** One line of a month's bill: a payment with its receipt, or an extra still to pay. */
export type BillLine =
  | { readonly kind: "receipt"; readonly row: ReceiptRow }
  | {
      readonly kind: "due";
      readonly chargeId: string;
      readonly title: string;
      /** When it was added, for the reader's own time zone to format. */
      readonly addedIso: string;
      readonly amount: string;
      /** "includes 18% GST", or null for an untaxed charge. */
      readonly taxNote: string | null;
    };

/** Everything billed in one calendar month (UTC), oldest first, with what it comes to. */
export interface BillingMonth {
  /** "2026-10": stable, for keys. */
  readonly key: string;
  /** "October 2026". */
  readonly label: string;
  /** What the month comes to: its payments plus anything still to pay, in each currency billed ("₹6,901"). */
  readonly total: string;
  readonly lines: readonly BillLine[];
}

const monthLabelFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Which month a payment sits in: a paid extra in the month it was added (so it stays where the customer first saw
 * it), anything else in the month it was paid.
 */
function receiptMonthDate(receipt: Receipt): Date {
  if (receipt.kind === "charge" && receipt.chargeCreatedAt !== null) return receipt.chargeCreatedAt;
  return receipt.paidAt ?? receipt.createdAt;
}

/** Money that counts toward a month's total: taken and kept. Refunds, failures and payments set aside do not. */
function countsTowardTotal(receipt: Receipt): boolean {
  return receipt.status === "captured" && !isUnappliedReason(receipt.attentionReason);
}

interface Entry {
  readonly at: Date;
  readonly line: BillLine;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly counts: boolean;
}

function totalOf(entries: readonly Entry[]): string {
  const byCurrency = new Map<BillingCurrency, number>();
  for (const entry of entries) {
    if (!entry.counts) continue;
    byCurrency.set(entry.currency, (byCurrency.get(entry.currency) ?? 0) + entry.amountCents);
  }
  if (byCurrency.size === 0) return formatMoney(0, entries[0]?.currency ?? "USD");
  return Array.from(byCurrency, ([currency, cents]) => formatMoney(cents, currency)).join(" + ");
}

/**
 * The Billing page's month-by-month bill: every payment and every open (unpaid) charge, grouped by the month it
 * belongs to, newest month first and oldest line first within a month. Waived charges are left out: they were never
 * billed. `receipts` are the payments the page lists; `openCharges` are the business's unpaid charges.
 */
export function billingMonths(receipts: readonly Receipt[], openCharges: readonly Charge[], brand: Brand = BRAND): BillingMonth[] {
  const rows = receiptRows(receipts, brand);
  const entries: Entry[] = receipts.map((receipt, index) => {
    const row = rows[index];
    if (row === undefined) throw new Error("receiptRows returned fewer rows than receipts");
    return {
      at: receiptMonthDate(receipt),
      line: { kind: "receipt", row },
      amountCents: receipt.amountCents,
      currency: receipt.currency,
      counts: countsTowardTotal(receipt),
    };
  });
  for (const charge of openCharges) {
    if (charge.status !== "open") continue;
    entries.push({
      at: charge.createdAt,
      line: {
        kind: "due",
        chargeId: charge.id,
        title: chargeLabel(charge),
        addedIso: charge.createdAt.toISOString(),
        amount: formatMoney(charge.amountCents, charge.currency),
        taxNote: charge.taxRateBasisPoints > 0 ? `includes ${charge.taxRateBasisPoints / 100}% GST` : null,
      },
      amountCents: charge.amountCents,
      currency: charge.currency,
      counts: true,
    });
  }

  const months = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.at);
    const month = months.get(key);
    if (month === undefined) months.set(key, [entry]);
    else month.push(entry);
  }

  return Array.from(months, ([key, monthEntries]) => {
    const ordered = monthEntries.toSorted((a, b) => a.at.getTime() - b.at.getTime());
    const first = ordered[0];
    if (first === undefined) throw new Error(`Month ${key} has no entries`);
    return { key, label: monthLabelFormat.format(first.at), total: totalOf(ordered), lines: ordered.map((entry) => entry.line) };
  }).toSorted((a, b) => b.key.localeCompare(a.key));
}
