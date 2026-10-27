import { isUnappliedReason, type StaffPaymentRow } from "@brandbasket/db";
import { adjacentMonth, monthRange } from "@brandbasket/shared/lib/billing/invoice-register";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { PillTone } from "@/components/console/status-pill";
import { monthLabel } from "@/lib/invoice-register-view";

/** The Payments page's filters, in the order the chips show them. */
export const PAYMENT_FILTERS = ["all", "attention", "failed", "refunded", "manual", "no-invoice"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export const PAYMENT_FILTER_LABELS: Readonly<Record<PaymentFilter, string>> = {
  all: "All",
  attention: "Needs a look",
  failed: "Failed",
  refunded: "Refunded",
  manual: "Manual",
  "no-invoice": "No invoice",
};

const PLAN_KINDS: ReadonlySet<StaffPaymentRow["kind"]> = new Set(["initial", "renewal", "reactivation"]);

const KIND_LABELS: Readonly<Record<StaffPaymentRow["kind"], string>> = {
  initial: "First payment",
  renewal: "Monthly plan",
  reactivation: "Plan restarted",
  extra_publish: "Extra publish",
  charge: "Extra",
  add_on: "Add-on",
};

const RAZORPAY_METHODS: Readonly<Record<string, string>> = {
  upi: "Razorpay UPI",
  card: "Razorpay card",
  netbanking: "Razorpay net banking",
  wallet: "Razorpay wallet",
  emi: "Razorpay EMI",
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kolkata",
});

export function readPaymentFilter(param: string | readonly string[] | undefined): PaymentFilter {
  return typeof param === "string" && (PAYMENT_FILTERS as readonly string[]).includes(param) ? (param as PaymentFilter) : "all";
}

/** Flagged for staff and not yet dealt with. */
export function needsLook(row: StaffPaymentRow): boolean {
  return row.attentionReason !== null && row.attentionResolvedAt === null;
}

/** A rupee payment that kept its money and bought something, still without its tax invoice. */
export function lacksInvoice(row: StaffPaymentRow): boolean {
  return row.currency === "INR" && row.status === "captured" && row.invoiceNumber === null && !isUnappliedReason(row.attentionReason);
}

export function matchesFilter(row: StaffPaymentRow, filter: PaymentFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return needsLook(row);
    case "failed":
      return row.status === "failed";
    case "refunded":
      return row.status === "refunded";
    case "manual":
      return row.provider === "manual";
    case "no-invoice":
      return lacksInvoice(row);
  }
}

export function filterCounts(rows: readonly StaffPaymentRow[]): Readonly<Record<PaymentFilter, number>> {
  return Object.fromEntries(PAYMENT_FILTERS.map((filter) => [filter, rows.filter((row) => matchesFilter(row, filter)).length])) as Record<PaymentFilter, number>;
}

/** What a payment kept: all of it, nothing when it failed, or what was left after a refund (nothing when no amount was recorded). */
function keptCents(row: StaffPaymentRow): number {
  if (row.status === "captured") return row.amountCents;
  if (row.status === "refunded") return row.amountCents - (row.refundedAmountCents ?? row.amountCents);
  return 0;
}

export interface PaymentFigures {
  readonly collectedCents: number;
  readonly paymentsCount: number;
  readonly planCents: number;
  readonly planClients: number;
  readonly extrasCents: number;
  readonly extrasCount: number;
  readonly refundedCents: number;
  readonly refundedCount: number;
  readonly failedCents: number;
  readonly failedCount: number;
  readonly attentionCount: number;
}

/** The KPI line, for one currency: amounts are never added across currencies. */
export function paymentFigures(rows: readonly StaffPaymentRow[], currency: MoneyCurrency): PaymentFigures {
  const mine = rows.filter((row) => row.currency === currency);
  const kept = mine.filter((row) => row.status !== "failed");
  const plan = kept.filter((row) => PLAN_KINDS.has(row.kind));
  const extras = kept.filter((row) => !PLAN_KINDS.has(row.kind));
  const refunded = mine.filter((row) => row.status === "refunded");
  const failed = mine.filter((row) => row.status === "failed");
  const sum = (list: readonly StaffPaymentRow[], value: (row: StaffPaymentRow) => number): number => list.reduce((total, row) => total + value(row), 0);
  return {
    collectedCents: sum(kept, keptCents),
    paymentsCount: kept.length,
    planCents: sum(plan, keptCents),
    planClients: new Set(plan.map((row) => row.businessId)).size,
    extrasCents: sum(extras, keptCents),
    extrasCount: extras.length,
    refundedCents: sum(refunded, (row) => row.refundedAmountCents ?? row.amountCents),
    refundedCount: refunded.length,
    failedCents: sum(failed, (row) => row.amountCents),
    failedCount: failed.length,
    attentionCount: mine.filter(needsLook).length,
  };
}

export function paymentKindLabel(kind: StaffPaymentRow["kind"]): string {
  return KIND_LABELS[kind];
}

export function paymentMethodLabel(row: StaffPaymentRow): string {
  if (row.provider === "manual") return row.recordedByName === null ? "Recorded by hand" : `Recorded by hand, by ${row.recordedByName}`;
  if (row.provider === "fake") return "Test checkout";
  return row.method === null ? "Razorpay" : (RAZORPAY_METHODS[row.method] ?? "Razorpay");
}

export function paymentStatus(row: StaffPaymentRow): { readonly label: string; readonly tone: PillTone } {
  if (row.status === "failed") return { label: "Failed", tone: "problem" };
  if (row.status === "refunded") return { label: "Refunded", tone: "todo" };
  if (needsLook(row)) return { label: "Needs a look", tone: "wait" };
  return { label: "Paid", tone: "done" };
}

export function paymentInvoiceLabel(row: StaffPaymentRow): string {
  if (row.invoiceNumber !== null) return row.invoiceNumber;
  return lacksInvoice(row) ? "Not yet" : "None";
}

export interface PaymentRowView {
  readonly id: string;
  readonly businessId: string;
  readonly when: string;
  readonly client: string;
  readonly forLabel: string;
  readonly method: string;
  readonly amount: string;
  readonly status: { readonly label: string; readonly tone: PillTone };
  readonly invoice: string;
  readonly href: string;
}

export function paymentRowView(row: StaffPaymentRow): PaymentRowView {
  return {
    id: row.id,
    businessId: row.businessId,
    when: WHEN.format(row.paidAt ?? row.createdAt),
    client: row.businessName,
    forLabel: paymentKindLabel(row.kind),
    method: paymentMethodLabel(row),
    amount: formatMoney(row.amountCents, row.currency),
    status: paymentStatus(row),
    invoice: paymentInvoiceLabel(row),
    href: `/clients/${row.businessId}/billing#payment-${row.id}`,
  };
}

/** A "YYYY-MM" month as instants, from midnight on the 1st in India to midnight on the next 1st. */
export function paymentMonthBounds(month: string): { readonly from: Date; readonly to: Date } | null {
  const range = monthRange(month);
  return range === null ? null : { from: new Date(`${range.from}T00:00:00+05:30`), to: new Date(`${range.to}T00:00:00+05:30`) };
}

export function paymentFilterHref(month: string, filter: PaymentFilter): string {
  return filter === "all" ? `/payments?month=${month}` : `/payments?month=${month}&show=${filter}`;
}

export interface PaymentMonthLink {
  readonly href: string;
  readonly label: string;
}

export function paymentMonthLinks(month: string): {
  readonly previous: PaymentMonthLink | null;
  readonly next: PaymentMonthLink | null;
  readonly exportHref: string;
} {
  const link = (neighbour: string | null): PaymentMonthLink | null =>
    neighbour === null ? null : { href: `/payments?month=${neighbour}`, label: monthLabel(neighbour) };
  return { previous: link(adjacentMonth(month, -1)), next: link(adjacentMonth(month, 1)), exportHref: `/payments/export?month=${month}` };
}
