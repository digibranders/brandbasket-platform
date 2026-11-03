import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing/tax";
import { isUnappliedReason, type BundledAddOn, type Charge, type CurrentPaymentMethod, type Plan, type Receipt, type Subscription } from "@brandbasket/db";
import { MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundledLinePrice, nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import { listTotalCents, packageBasisPointsFor, percentOf } from "@brandbasket/shared/lib/billing/packages";
import { paymentLabel } from "@brandbasket/shared/lib/billing/payment-method";
import { nextPaymentDate } from "@brandbasket/shared/lib/billing/period";
import { receiptNumber } from "@brandbasket/shared/lib/billing/receipt-title";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { renewalChargeCents } from "@brandbasket/shared/lib/billing/terms";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { z } from "zod";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { ServiceKey } from "@/ui";

/*
 * Plan & billing's pure rules. Ported from apps/platform lib/billing/drop-service.ts, add-on-copy.ts, payment-method-view.ts,
 * receipt-rows.ts and the plan card of components/panel/billing/plan-summary.tsx. Every figure comes from the shared billing
 * functions (bundledLinePrice, renewalChargeCents, gstInsideCents, chargedAmountCents); nothing here prices on its own.
 */

export const BILLING_PATH = "/billing";
export const INVOICES_PATH = "/billing/invoices";
export const PAYMENT_PATH = "/billing/payment";
/** Where a question about billing goes: a new request about billing (gate G7, and every "write to us" of the old page). */
export const BILLING_REQUEST_HREF = "/requests?new=1&intent=billing";

/** The tabs of Plan & billing. Refer a business is hidden until the owner decides the offer (gate G8). */
export const BILLING_TABS = [
  { href: BILLING_PATH, label: "Your services" },
  { href: INVOICES_PATH, label: "Invoices" },
  { href: PAYMENT_PATH, label: "Payment and details" },
] as const;

// ---- Which service ----

/** The app's short name of each catalogue service. */
export const SERVICE_KEY_OF: Readonly<Record<MonthlyAddOnId, ServiceKey>> = { "managed-website": "website", "digital-growth": "social", "local-seo-aeo": "search" };

/** A service as Plan & billing names it (the mock's words): "Social & Ads", not the catalogue's longer title. */
const BILLING_NAMES: Readonly<Record<MonthlyAddOnId, string>> = { "managed-website": "Managed Website", "digital-growth": "Social & Ads", "local-seo-aeo": "Local SEO + AEO" };

export function serviceName(addOn: MonthlyAddOnId): string {
  return BILLING_NAMES[addOn];
}

/** `?add=` uses the app's short service names (Not bought links to `/billing?add=social`). */
const SERVICE_OF_PARAM: Readonly<Record<string, MonthlyAddOnId>> = { website: "managed-website", social: "digital-growth", search: "local-seo-aeo" };

/** The service `?add=` names, or null for anything else (a repeated or unknown value is ignored). */
export function readAddParam(value: string | string[] | undefined): MonthlyAddOnId | null {
  return typeof value === "string" && Object.hasOwn(SERVICE_OF_PARAM, value) ? (SERVICE_OF_PARAM[value] ?? null) : null;
}

/** The services `?services=` names on a reactivation, as raw text: the shared basket keeps only catalogue ids. */
export function readServicesParam(raw: string | string[] | undefined): string[] {
  return (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",");
}

// ---- Dates ----

/** Said instead of an Add or Remove while a kept plan waits to start: the subscription it carries on from is cancelled at the provider. */
export function planStartsAgain(startsOn: Date, now: Date = new Date()): string {
  return `Your plan starts again on ${formatDate(startsOn, now)}. You can change your services from then.`;
}

/** Where a service stands, as a word (never colour alone) and the tone the row draws it in. */
export interface AddOnStatus {
  readonly word: "Active" | "Ending" | "Not added";
  readonly tone: "pos" | "warn" | "neutral";
}

/** The word on a service's row: in the plan's payment, on its way out at the next billing date, or not added. */
export function addOnStatus(entry: { readonly kind: "available" } | { readonly kind: "included"; readonly endsOn: Date | null }): AddOnStatus {
  if (entry.kind === "available") return { word: "Not added", tone: "neutral" };
  return entry.endsOn === null ? { word: "Active", tone: "pos" } : { word: "Ending", tone: "warn" };
}

// ---- Dropping a service ----

/** What the customer is shown before a service is dropped from the plan's payment. */
export interface DropPreview {
  /** The services that stay, in the catalogue's order. */
  readonly keeps: readonly MonthlyAddOnId[];
  /** The monthly payment from the next bill: the services that stay at list price, GST included in rupees. */
  readonly newMonthlyCents: number;
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
  /** Dropping ends a package price and ad credit the business still has: false once the offer is already given up. */
  readonly endsPackage: boolean;
  /** The service being dropped is Managed Website: the site goes offline when its paid month ends. */
  readonly endsWebsite: boolean;
}

/**
 * What dropping `dropping` would leave, from the lines that are staying now (removeBundledAddOn in
 * @brandbasket/shared/server/basket-change does the same on the server, from the database). Null when it is the only
 * service: stopping that is cancelling, so no drop is offered. The figures are display only; the server prices again.
 */
export function dropPreview(input: {
  readonly staying: readonly Pick<BundledAddOn, "addOn" | "listAmountCents" | "taxRateBasisPoints">[];
  readonly dropping: MonthlyAddOnId;
  readonly forfeited: boolean;
  readonly currency: MoneyCurrency;
}): DropPreview | null {
  const kept = input.staying.filter((line) => line.addOn !== input.dropping);
  const taxRateBasisPoints = kept[0]?.taxRateBasisPoints;
  if (taxRateBasisPoints === undefined) return null;
  return {
    keeps: MONTHLY_ADD_ON_IDS.filter((id) => kept.some((line) => line.addOn === id)),
    newMonthlyCents: chargedAmountCents(listTotalCents(kept), 0),
    currency: input.currency,
    taxRateBasisPoints,
    endsPackage: !input.forfeited,
    endsWebsite: input.dropping === "managed-website",
  };
}

/** Said before a package price and ad credit are given up, word for word as the owner's plan has it. */
export const PACKAGE_ENDS = "Your package price and ad credit end for good. Adding a service again later will be at its own price.";

/** The sentences of the cancel dialog: what stays, what is paid from the next bill, and what is lost when a package ends. */
export interface DropCopy {
  readonly keeps: string;
  readonly monthly: string;
  /** Null unless the service being dropped is Managed Website. */
  readonly websiteOffline: string | null;
  /** Null when the business has no package to lose. */
  readonly packageEnds: string | null;
}

/** "You keep Managed Website and Social & Ads." / "From Fri 27 Nov you pay ₹12,998 a month, GST included." */
export function dropCopy(preview: DropPreview, nextBillingOn: string): DropCopy {
  const titles = preview.keeps.map(serviceName);
  const tax = preview.taxRateBasisPoints > 0 ? ", GST included" : "";
  return {
    keeps: `You keep ${titles.join(" and ")}.`,
    monthly: `From ${nextBillingOn} you pay ${formatMoney(preview.newMonthlyCents, preview.currency)} a month${tax}.`,
    websiteOffline: preview.endsWebsite ? `Your website goes offline on ${nextBillingOn}.` : null,
    packageEnds: preview.endsPackage ? PACKAGE_ENDS : null,
  };
}

/** The most a cancel reason may hold: the `end_reason` column's check. */
export const REASON_LIMIT = 500;

const UNREADABLE_FORM = "We couldn't tell what you asked for. Reload the page and try again.";

/** Add or keep: only which service. Everything else comes from the server, under the business's billing lock. */
export const AddServiceForm = z.object({ addOn: z.enum(MONTHLY_ADD_ON_IDS, { error: UNREADABLE_FORM }) });

/** Cancel: which service, and an optional reason in the customer's words. */
export const CancelServiceForm = z.object({
  addOn: z.enum(MONTHLY_ADD_ON_IDS, { error: "Choose the service to cancel." }),
  reason: z
    .string()
    .trim()
    .max(REASON_LIMIT, `Keep the reason to ${REASON_LIMIT} characters or fewer.`)
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value)),
});

// ---- The plan's state ----

/** Where the plan stands, each with the one thing the page asks of the customer. */
export type PlanState =
  /** Paid and renewing: the services and their actions. */
  | { readonly kind: "paid" }
  /** Razorpay is retrying a renewal; the site goes offline on `until` if it keeps failing. Action: change the payment method. */
  | { readonly kind: "renewal-failing"; readonly until: Date }
  /** Money arrived that bought nothing and staff are sorting it out. No action: nothing more to pay. */
  | { readonly kind: "under-review" }
  /** The paid period ran out. Action: Reactivate. */
  | { readonly kind: "lapsed" }
  /** Never paid. Action: go to checkout. */
  | { readonly kind: "unpaid" };

export function planStateOf(billing: Pick<CustomerBilling, "status" | "paymentUnderReview" | "renewalFailingUntil">): PlanState {
  switch (billing.status) {
    case "unpaid":
      return billing.paymentUnderReview ? { kind: "under-review" } : { kind: "unpaid" };
    case "lapsed":
      return { kind: "lapsed" };
    case "paid":
      return billing.renewalFailingUntil === null ? { kind: "paid" } : { kind: "renewal-failing", until: billing.renewalFailingUntil };
    default: {
      const unhandled: never = billing.status;
      throw new Error(`Unhandled billing status: ${String(unhandled)}`);
    }
  }
}

// ---- The bill ----

export interface BillRow {
  readonly label: string;
  readonly amount: string;
  /** A discount reads as money off. */
  readonly discount: boolean;
}

/** The monthly bill: the services that bill at the next payment, the money off, and what the next payment takes. */
export interface BillView {
  readonly rows: readonly BillRow[];
  readonly totalCents: number;
  readonly total: string;
  /** "Includes ₹4,637 GST.", or null when the plan has no GST (USD never mentions it). */
  readonly gstLine: string | null;
  /** "Monthly ad money of ₹3,000 is added to your ads.", or null when none comes with the next payment. */
  readonly adMoneyLine: string | null;
}

type BillLine = Pick<BundledAddOn, "addOn" | "listAmountCents" | "offerDiscountAmountCents" | "pendingOfferDiscountAmountCents" | "taxRateBasisPoints">;
type BillSubscription = Pick<Subscription, "bundledAddOnNetCents" | "pendingBundledAddOnNetCents" | "discountAmountCents" | "nextDiscountAmountCents" | "adCreditCents">;

/** A live line that bills at the next payment: active and not asked to stop. */
export function billsNext(row: Pick<BundledAddOn, "status" | "endRequestedAt">): boolean {
  return row.status === "active" && row.endRequestedAt === null;
}

/**
 * The bill for the next payment. Each line at the price it bills at from then (bundledLinePrice, the figure the provider was
 * told), the package offer and any code as money off, and the total from renewalChargeCents over the subscription's own
 * next-renewal figures, so the total is the amount the provider takes. Ad money only while no removal is waiting: a drop ends
 * it at the renewal that takes the line off.
 */
export function billView(input: { readonly lines: readonly BillLine[]; readonly subscription: BillSubscription; readonly plan: Pick<Plan, "recurringAmountCents" | "currency" | "taxRateBasisPoints"> }): BillView {
  const { lines, subscription, plan } = input;
  const { currency } = plan;
  const prices = lines.map((line) => bundledLinePrice(line, currency));
  const listCents = prices.reduce((sum, price) => sum + price.listCents, 0);
  const packageCents = prices.reduce((sum, price) => sum + price.discountCents, 0);
  const codeCents = nextDiscountCents(subscription);
  const totalCents = renewalChargeCents(plan, codeCents, nextBundledNetCents(subscription)) ?? 0;
  const basisPoints = packageBasisPointsFor({ services: lines.map((line) => line.addOn as MonthlyAddOnId), forfeited: false });
  const money = (cents: number) => formatMoney(cents, currency);
  const rows: BillRow[] = [{ label: `List price, ${formatQuantity(lines.length, "service")}`, amount: money(listCents), discount: false }];
  if (packageCents > 0) rows.push({ label: basisPoints > 0 ? `Package discount, ${percentOf(basisPoints)}%` : "Package discount", amount: `−${money(packageCents)}`, discount: true });
  if (codeCents > 0) rows.push({ label: "Code discount", amount: `−${money(codeCents)}`, discount: true });
  const gstCents = gstInsideCents(totalCents, plan.taxRateBasisPoints);
  return {
    rows,
    totalCents,
    total: money(totalCents),
    gstLine: plan.taxRateBasisPoints > 0 ? `Includes ${money(gstCents)} GST.` : null,
    adMoneyLine: subscription.adCreditCents > 0 && subscription.pendingBundledAddOnNetCents === null ? `Monthly ad money of ${money(subscription.adCreditCents)} is added to your ads.` : null,
  };
}

/** The line under the page title: the next payment and its date, and that prices include GST (never said in dollars). */
export function nextPaymentLine(input: {
  readonly subscription: Pick<Subscription, "provider" | "cancelRequestedAt" | "commitmentEndsAt" | "paidThroughAt">;
  readonly totalCents: number;
  readonly plan: Pick<Plan, "currency" | "taxRateBasisPoints">;
  readonly now: Date;
}): string {
  const { subscription, totalCents, plan, now } = input;
  const on = nextPaymentDate(subscription, now);
  const gst = plan.taxRateBasisPoints > 0 ? ` All prices include ${percentOf(plan.taxRateBasisPoints)}% GST.` : "";
  if (on === null) return gst.trim();
  if (subscription.cancelRequestedAt !== null) return `No more payments. Your plan ends on ${formatDate(on, now)}.`;
  if (subscription.provider === "manual") return `We arrange your next payment with you directly.${gst}`;
  return `Next payment ${formatMoney(totalCents, plan.currency)} on ${formatDate(on, now)}.${gst}`;
}

// ---- Payment method ----

/**
 * What the Payment method section says, from the newest payment and the plan. Ported from apps/platform
 * lib/billing/payment-method-view.ts.
 */
export type PaymentMethodView =
  /** Staff record each bank transfer by hand, so there is nothing automatic to say. */
  | { readonly kind: "bank-transfer"; readonly reference: string | null }
  /** The provider takes the next payment on this card, UPI or account by itself. */
  | { readonly kind: "renews"; readonly label: string }
  /** The customer pays by hand each time: the plan is not billed by the provider, or has lapsed, or this was a paid extra. */
  | { readonly kind: "last-paid"; readonly label: string };

/** The part of the plan's billing state that decides whether the next payment is taken by itself. */
export interface RenewalFacts {
  readonly status: "paid" | "lapsed" | "unpaid";
  readonly subscription: Pick<Subscription, "provider" | "cancelRequestedAt"> | null;
}

/** The plan renews by itself at the provider: paid, billed by a provider (not by hand), and nobody asked for it to end. */
export function renewsAutomatically({ status, subscription }: RenewalFacts): boolean {
  return status === "paid" && subscription !== null && subscription.provider !== "manual" && subscription.cancelRequestedAt === null;
}

/** The payments that pay for the plan itself. A paid extra or a charge staff recorded is a one-off and is not one of them. */
const PLAN_PAYMENT_KINDS: readonly CurrentPaymentMethod["kind"][] = ["initial", "renewal", "reactivation"];

/**
 * Which wording fits. A paid extra, or a charge staff recorded by hand, may have been paid some other way than the plan is,
 * so it is never presented as the renewal method, and never as "you pay by bank transfer" to a customer whose plan the
 * provider renews.
 */
export function paymentMethodView(method: CurrentPaymentMethod, renews: boolean): PaymentMethodView {
  const paysForPlan = PLAN_PAYMENT_KINDS.includes(method.kind);
  const label = paymentLabel(method);
  if (method.provider === "manual") {
    return paysForPlan || !renews ? { kind: "bank-transfer", reference: method.manualReference } : { kind: "last-paid", label };
  }
  return renews && paysForPlan ? { kind: "renews", label } : { kind: "last-paid", label };
}

// ---- Invoices ----

export type InvoiceTone = "pos" | "warn" | "neutral" | "neg";

/** One row of the invoices list: a payment with its invoice or receipt, or a charge still to pay. */
export type InvoiceRow =
  | {
      readonly kind: "payment";
      readonly id: string;
      /** The invoice number as issued (FY/26-27/000041), or the receipt number for a payment with no tax invoice. */
      readonly number: string;
      readonly date: Date;
      readonly amountCents: number;
      readonly amount: string;
      readonly status: string;
      readonly tone: InvoiceTone;
      /** False for a failed attempt: nothing was taken, so there is nothing to download. */
      readonly downloadable: boolean;
    }
  | { readonly kind: "due"; readonly id: string; readonly number: string; readonly date: Date; readonly amountCents: number; readonly amount: string; readonly status: string; readonly tone: InvoiceTone };

function receiptStatus(receipt: Receipt): { readonly status: string; readonly tone: InvoiceTone } {
  if (receipt.status === "failed") return { status: "Failed", tone: "neg" };
  if (receipt.status === "refunded") return { status: "Refunded", tone: "neutral" };
  if (isUnappliedReason(receipt.attentionReason)) return { status: "Received", tone: "warn" };
  return { status: "Paid", tone: "pos" };
}

/** Payments newest first (as listed), then any open charge, newest first, ahead of them: what is still to pay comes first. */
export function invoiceRows(receipts: readonly Receipt[], openCharges: readonly Charge[]): readonly InvoiceRow[] {
  const due: InvoiceRow[] = openCharges
    .filter((charge) => charge.status === "open")
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((charge) => ({ kind: "due", id: charge.id, number: chargeLabel(charge), date: charge.createdAt, amountCents: charge.amountCents, amount: formatMoney(charge.amountCents, charge.currency), status: "To pay", tone: "warn" }));
  const paid: InvoiceRow[] = receipts.map((receipt) => ({
    kind: "payment",
    id: receipt.id,
    number: receipt.taxInvoiceNumber ?? receiptNumber(receipt.sequence),
    date: receipt.paidAt ?? receipt.createdAt,
    amountCents: receipt.amountCents,
    amount: formatMoney(receipt.amountCents, receipt.currency),
    ...receiptStatus(receipt),
    downloadable: receipt.status !== "failed",
  }));
  return [...due, ...paid];
}
