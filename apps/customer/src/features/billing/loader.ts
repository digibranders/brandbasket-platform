import "server-only";
import { addMonthsUtc, monthsPerCycle } from "@brandbasket/billing";
import { findBillingProfile, withTenantScope } from "@brandbasket/db";
import type { BillingInterval } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { addOnPrice, addOnById, perCycle, PLAN_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { paymentReturnView, readPaymentReturn, type PaymentReturnView } from "@brandbasket/shared/lib/billing/payment-return";
import { planLabel } from "@brandbasket/shared/lib/billing/receipt-title";
import { renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { getAppDb } from "@/lib/db";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { listCustomerReceipts } from "../checkout/server/billing";
import { loadBillingDetailsView } from "../checkout/server/billing-details";
import { listOpenCustomerCharges } from "../checkout/server/charges";
import type { BillingDetailsView } from "../checkout/rules/billing-details-view";
import { readChargeNotice, type ChargeNotice } from "../checkout/rules/charge-notices";
import { gstNote, type PaymentSummary, type PaymentSummaryRow } from "../checkout/rules/payment-summary";
import { servicesAfterToggle } from "../checkout/rules/membership";
import { receiptDocument, type ReceiptLine } from "../checkout/rules/receipt-document";
import {
  addOnStatus,
  billsNext,
  billView,
  dropCopy,
  invoiceRows,
  nextPaymentLine,
  paymentMethodView,
  planChangesFirst,
  planStartsAgain,
  planStateOf,
  readAddParam,
  readServicesParam,
  renewsAutomatically,
  serviceName,
  SERVICE_KEY_OF,
  type AddOnStatus,
  type BillView,
  type DropCopy,
  type InvoiceRow,
  type PaymentMethodView,
  type PlanState,
} from "./rules";
import { loadAddOnsPage, type AddOnOffer, type AddOnPageEntry } from "./server/add-ons";
import { findCustomerPaymentMethod, findReactivation, findReactivationPlan } from "./server/billing";
import type { ServiceKey } from "@/ui";

/*
 * The views behind Plan & billing. Each panel loads on its own and fails on its own (Loaded). Every figure comes worked out
 * from the shared billing functions through rules.ts; the screens only lay it out.
 */

type Params = Readonly<Record<string, string | string[] | undefined>>;

/** What a service's row offers, already worded. */
export type ServiceAction =
  /** Add it now, after the confirm dialog shows `summary`: what is paid today and what follows. */
  | { readonly kind: "add"; readonly summary: PaymentSummary }
  /** It is ending: keep it at no charge. */
  | { readonly kind: "keep" }
  /** It can be cancelled from the next billing date. */
  | { readonly kind: "cancel" }
  /** It cannot be changed here: why, and whether to ask the team. */
  | { readonly kind: "note"; readonly text: string; readonly ask: boolean }
  | { readonly kind: "none" };

export interface ServiceRowView {
  readonly addOn: MonthlyAddOnId;
  /** The area of the app it is worked in; null for monitoring, which has none. */
  readonly service: ServiceKey | null;
  readonly name: string;
  readonly status: AddOnStatus;
  /** What it lists at a month. The package discount is not taken off here: This month's bill shows it once. */
  readonly price: string;
  readonly line: string;
  /** What its first month costs on the first-month offer ("₹1"), when Add would give it; null otherwise. */
  readonly offerPrice: string | null;
  readonly action: ServiceAction;
}

/** One service the cancel dialog offers, with what cancelling it leaves. */
export interface CancelOption {
  readonly addOn: MonthlyAddOnId;
  readonly name: string;
  readonly copy: DropCopy;
}

export interface ServicesPanelView {
  readonly rows: readonly ServiceRowView[];
  /** Null when no service can be cancelled on its own. */
  readonly cancel: { readonly endsOn: string; readonly options: readonly CancelOption[] } | null;
  /** The next payment's bill, or null when there is no live plan to bill. */
  readonly bill: BillView | null;
  readonly headerLine: string | null;
  /** The strip above the services: the next payment and its date, and how many of the three plans are on. */
  readonly glance: { readonly nextAmount: string; readonly nextOn: string; readonly plansHeld: number; readonly plansTotal: number } | null;
}

export interface ReactivationCardView {
  readonly planName: string;
  /** What each payment takes once it restarts. */
  readonly monthlyAmount: string;
  /** "a month", or "a year" for a yearly plan that lapsed. */
  readonly per: string;
  /** The services the press posts when the customer chooses them, or null when the basket comes back as it was. */
  readonly chosen: readonly MonthlyAddOnId[] | null;
  /** The picker's rows for a customer who cancelled themselves: each service at its own price, and the link that ticks it. */
  readonly picker: readonly { readonly addOn: MonthlyAddOnId; readonly name: string; readonly price: string; readonly selected: boolean; readonly href: string }[] | null;
  /** What the confirm dialog shows before the payment opens. */
  readonly summary: PaymentSummary;
}

export interface NoticesView {
  readonly charge: ChargeNotice | null;
  /** A charge payment is still being confirmed with the bank. */
  readonly chargeWaiting: boolean;
  readonly paymentReturn: PaymentReturnView;
}

export interface BillingOverview {
  readonly state: PlanState;
  readonly canManage: boolean;
  /** The service `?add=` names, to open its add straight away. */
  readonly preselect: MonthlyAddOnId | null;
  readonly notices: Loaded<NoticesView>;
  /** Null for a business with no plan to show services for (unpaid, under review, lapsed). */
  readonly services: Loaded<ServicesPanelView> | null;
  /** Only for a lapsed business. */
  readonly reactivation: Loaded<ReactivationCardView | null> | null;
}

/** Add on a yearly plan, or one not billed by a combined subscription: the charge for the days left, then the new payment. */
function quoteSummary(offer: Extract<AddOnOffer, { kind: "quote" }>, entry: AddOnPageEntry, interval: BillingInterval, now: Date): PaymentSummary {
  const { currency } = entry.price;
  const days = formatQuantity(offer.daysLeft, "day");
  return {
    title: `Add ${serviceName(entry.addOn)}`,
    rows: [{ key: "rest", label: `${serviceName(entry.addOn)}, ${days} left ${interval === "year" ? "in your year" : "this month"}`, amount: formatMoney(offer.chargeCents, currency), tone: "plain" }],
    totalLabel: "Due today",
    total: formatMoney(offer.chargeCents, currency),
    notes: [`Then ${formatMoney(offer.nextRenewalCents, currency)} ${perCycle(interval)} from ${formatDate(offer.renewsOn, now)}.`, ...gstNote(currency)],
  };
}

/**
 * Add as one combined subscription (plan 63, Option Y): the service up to the new billing date (₹1 on the first-month offer), the
 * plan's days from its paid-through date to then, and every service at its price a month from then.
 */
function combinedSummary(offer: Extract<AddOnOffer, { kind: "combined" }>, entry: AddOnPageEntry, now: Date): PaymentSummary {
  const { currency } = entry.price;
  const name = serviceName(entry.addOn);
  const until = formatDate(offer.newBillingDate, now);
  const rows: PaymentSummaryRow[] = [
    { key: "service", label: offer.offer ? `${name}, first month offer` : `${name}, until ${until}`, amount: formatMoney(offer.serviceCents, currency), tone: "plain" },
  ];
  const extended = offer.extensionCents > 0;
  if (extended) {
    // Whole days: the two dates fall at the same time of day, so the gap is a whole number of days give or take a clock change.
    const extraDays = Math.round((offer.newBillingDate.getTime() - offer.paidThroughAt.getTime()) / 86_400_000);
    rows.push({ key: "plan", label: `Current plan, ${formatQuantity(extraDays, "extra day")}`, amount: formatMoney(offer.extensionCents, currency), tone: "plain" });
  }
  return {
    title: `Add ${name}`,
    rows,
    totalLabel: "Due today",
    total: formatMoney(offer.upfrontCents, currency),
    notes: [
      ...(extended
        ? [`All your services will now renew together on ${until}. Your current plan is paid until ${formatDate(offer.paidThroughAt, now)}, so today also covers the days in between.`]
        : []),
      `Then ${formatMoney(offer.monthlyCents, currency)} a month for all your services, from ${until}.`,
      ...gstNote(currency),
    ],
  };
}

const ASK_THE_TEAM = "Ask the team and we'll add it for you.";

function availableAction(offer: AddOnOffer, entry: AddOnPageEntry, canAdd: boolean, interval: BillingInterval, now: Date): ServiceAction {
  switch (offer.kind) {
    case "quote":
      return canAdd ? { kind: "add", summary: quoteSummary(offer, entry, interval, now) } : { kind: "none" };
    case "combined":
      return canAdd ? { kind: "add", summary: combinedSummary(offer, entry, now) } : { kind: "none" };
    case "change-pending":
      return { kind: "note", text: planChangesFirst(offer.changesOn, now), ask: false };
    case "renewal-due":
      return offer.renewsOn === null ? { kind: "note", text: ASK_THE_TEAM, ask: true } : { kind: "note", text: `Your payment is due within the hour. Add it after ${formatDate(offer.renewsOn, now)}.`, ask: false };
    case "manual":
      return { kind: "note", text: "You pay us by bank transfer, so ask the team and we'll add it.", ask: true };
    case "plan-kept":
      return { kind: "note", text: planStartsAgain(offer.startsOn, now), ask: false };
    case "write":
      return { kind: "note", text: ASK_THE_TEAM, ask: true };
    default: {
      const unhandled: never = offer;
      throw new Error(`Unhandled add-on offer: ${JSON.stringify(unhandled)}`);
    }
  }
}

function serviceRow(entry: AddOnPageEntry, canManage: boolean, canAdd: boolean, activatedAt: Date | null, interval: BillingInterval, now: Date): ServiceRowView {
  const payment = interval === "year" ? "yearly" : "monthly";
  const base = { addOn: entry.addOn, service: SERVICE_KEY_OF[entry.addOn], name: serviceName(entry.addOn), status: addOnStatus(entry), price: formatMoney(entry.price.listCents, entry.price.currency) };
  if (entry.kind === "available") {
    const offerPrice = entry.offer.kind === "combined" && entry.offer.offer ? formatMoney(entry.offer.serviceCents, entry.price.currency) : null;
    return { ...base, line: addOnById(entry.addOn).line, offerPrice, action: canManage ? availableAction(entry.offer, entry, canAdd, interval, now) : { kind: "none" } };
  }
  const line =
    entry.endsOn !== null
      ? `Stops on ${formatDate(entry.endsOn, now)}. You won't be charged for it after that.`
      : entry.joinsOn !== null
        ? `Joins your ${payment} payment on ${formatDate(entry.joinsOn, now)}.`
        : activatedAt === null
          ? `Included in your ${payment} plan payment.`
          : `Since ${formatDate(activatedAt, now)}.`;
  const action: ServiceAction = !canManage
    ? { kind: "none" }
    : entry.endsOn !== null
      ? entry.keepable && canAdd
        ? { kind: "keep" }
        : { kind: "none" }
      : entry.drop !== null && entry.nextBillingOn !== null
        ? { kind: "cancel" }
        : { kind: "none" };
  return { ...base, line, offerPrice: null, action };
}

/** The services, the cancel dialog and the bill, for a business with a live plan. */
export async function loadServicesPanel(customer: CustomerContext, canAdd: boolean, now: Date): Promise<ServicesPanelView> {
  const page = await loadAddOnsPage(customer, now);
  const canManage = customer.role === "owner";
  const interval = customer.billing.subscription?.billingInterval ?? "month";
  const rows = page.addOns.map((entry) => {
    const line = page.lines.find((row) => row.addOn === entry.addOn && row.status === "active");
    return serviceRow(entry, canManage, canAdd, line?.activatedAt ?? null, interval, now);
  });
  const nextBillingOn = customer.billing.subscription?.paidThroughAt ?? null;
  const options = page.addOns.flatMap((entry): CancelOption[] =>
    entry.kind === "included" && entry.endsOn === null && entry.drop !== null && nextBillingOn !== null
      ? [{ addOn: entry.addOn, name: serviceName(entry.addOn), copy: dropCopy(entry.drop, formatDate(nextBillingOn, now), interval) }]
      : [],
  );
  const { subscription, plan } = customer.billing;
  const bill = subscription === null || plan === null ? null : billView({ lines: page.lines.filter(billsNext), subscription, plan });
  return {
    rows,
    cancel: canManage && options.length > 0 && nextBillingOn !== null ? { endsOn: formatDate(nextBillingOn, now), options } : null,
    bill,
    headerLine: subscription === null || plan === null || bill === null ? null : nextPaymentLine({ subscription, totalCents: bill.totalCents, plan, now }),
    glance:
      bill === null || nextBillingOn === null
        ? null
        : {
            nextAmount: bill.total,
            nextOn: formatDate(nextBillingOn, now),
            plansHeld: PLAN_ADD_ON_IDS.filter((addOn) => page.addOns.some((entry) => entry.kind === "included" && entry.addOn === addOn)).length,
            plansTotal: PLAN_ADD_ON_IDS.length,
          },
  };
}

/** What a lapsed customer is offered: the plan, the month's price and, for one who cancelled, the services to choose. */
export async function loadReactivationCard(customer: CustomerContext, params: Params): Promise<ReactivationCardView | null> {
  const [plan, reactivation] = await Promise.all([findReactivationPlan(customer), findReactivation(customer, readServicesParam(params.services))]);
  if (plan === null || reactivation === null) return null;
  const picker = reactivation.cancelled
    ? PLAN_ADD_ON_IDS.map((addOn) => ({
        addOn,
        name: serviceName(addOn),
        price: formatMoney(addOnPrice(addOnById(addOn), plan.currency).chargedCents, plan.currency),
        selected: reactivation.services.includes(addOn),
        href: `/billing?services=${servicesAfterToggle(reactivation.services, addOn).join(",")}`,
      }))
    : null;
  // The basket less the code a lapse keeps, through the shared renewal figure. A discount that leaves nothing was refused
  // before this too (chargedAmountCents threw); the panel shows its error state rather than a price nobody is charged.
  const monthlyAmount = renewalCharge(plan, reactivation.discountCents, reactivation.netCents);
  if (monthlyAmount === null) throw new RangeError(`The reactivation discount leaves nothing to charge for business ${customer.businessId}.`);
  const per = perCycle(reactivation.billingInterval);
  const now = new Date();
  const rows: PaymentSummaryRow[] = reactivation.lines.map((line) => ({ key: line.addOn, label: line.title, amount: formatMoney(line.netCents, plan.currency), tone: "plain" }));
  if (reactivation.discountCents > 0) rows.push({ key: "code", label: "Your code", amount: `-${formatMoney(reactivation.discountCents, plan.currency)}`, tone: "save" });
  return {
    planName: planLabel(plan.name),
    monthlyAmount,
    per,
    chosen: reactivation.cancelled ? reactivation.services : null,
    picker,
    summary: {
      title: "Reactivate your plan",
      rows,
      totalLabel: "Due today",
      total: monthlyAmount,
      notes: [`It renews ${per} from ${formatDate(addMonthsUtc(now, monthsPerCycle(reactivation.billingInterval)), now)}.`, ...gstNote(plan.currency)],
    },
  };
}

async function loadNotices(customer: CustomerContext, params: Params): Promise<NoticesView> {
  const charge = readChargeNotice(params.charge);
  // A charge payment is confirmed once none is open any more.
  const waiting = charge === "processing" && (await listOpenCustomerCharges(customer)).length > 0;
  return {
    charge: charge === "processing" ? (waiting ? null : "paid") : charge,
    chargeWaiting: waiting,
    paymentReturn: paymentReturnView({ returned: readPaymentReturn(params.payment), hasAccess: customer.billing.hasAccess, paymentUnderReview: customer.billing.paymentUnderReview }),
  };
}

/** Plan & billing's first tab. The page's guard has run; billing is shown in every state. */
export async function loadBillingOverview(customer: CustomerContext, params: Params, now: Date = new Date()): Promise<BillingOverview> {
  const state = planStateOf(customer.billing);
  const notices = await load("billing.notices", () => loadNotices(customer, params));
  // No second add while a payment for one is being confirmed.
  const canAdd = !(notices.ok && notices.data.chargeWaiting);
  const live = state.kind === "paid" || state.kind === "renewal-failing";
  return {
    state,
    canManage: customer.role === "owner",
    preselect: readAddParam(params.add),
    notices,
    services: live ? await load("billing.services", () => loadServicesPanel(customer, canAdd, now)) : null,
    reactivation: state.kind === "lapsed" ? await load("billing.reactivation", () => loadReactivationCard(customer, params)) : null,
  };
}

// ---- Invoices ----

export interface InvoiceView {
  readonly row: InvoiceRow;
  /** The lines of the invoice or receipt, as its PDF prints them. Null for a charge still to pay. */
  readonly lines: readonly ReceiptLine[] | null;
  readonly total: string;
}

export interface InvoicesView {
  readonly invoices: readonly InvoiceView[];
  /** "Billed to Apex Diagnostics Private Limited. GSTIN 27AAPFU0939F1ZV.", or null without saved details. */
  readonly billedTo: string | null;
  /** Only the owner downloads invoices (the receipts route is owner only). */
  readonly canDownload: boolean;
}

/** Every payment with its invoice or receipt, newest first, and any charge still to pay ahead of them. */
export async function loadInvoices(customer: CustomerContext): Promise<InvoicesView> {
  const { tenant } = customer;
  const [receipts, openCharges, profile] = await Promise.all([
    listCustomerReceipts(customer),
    listOpenCustomerCharges(customer),
    withTenantScope(getAppDb(), tenant, (tx) => findBillingProfile(tx, tenant.businessId)),
  ]);
  const rows = invoiceRows(receipts, openCharges);
  const invoices = rows.map((row): InvoiceView => {
    const receipt = row.kind === "payment" ? receipts.find((candidate) => candidate.id === row.id) : undefined;
    if (receipt === undefined || receipt.status === "failed") return { row, lines: null, total: row.amount };
    const document = receiptDocument(receipt, { businessName: tenant.businessName, email: customer.user.email });
    return { row, lines: document.lines, total: document.total.amount };
  });
  const billedTo = profile === null ? null : `Billed to ${profile.legalName}.${profile.gstin === null ? "" : ` GSTIN ${profile.gstin}.`}`;
  return { invoices, billedTo, canDownload: customer.role === "owner" };
}

// ---- Payment and details ----

export interface PaymentView {
  /** Null before the first payment. */
  readonly method: PaymentMethodView | null;
  /** The day the plan renews on, for "Renews automatically on Fri 27 Nov". Null when it does not renew by itself. */
  readonly renewsOn: string | null;
}

export async function loadPaymentMethod(customer: CustomerContext, now: Date = new Date()): Promise<PaymentView> {
  const method = await findCustomerPaymentMethod(customer);
  const renews = renewsAutomatically(customer.billing);
  const paidThrough = customer.billing.subscription?.paidThroughAt ?? null;
  return { method: method === null ? null : paymentMethodView(method, renews), renewsOn: renews && paidThrough !== null ? formatDate(paidThrough, now) : null };
}

export interface PaymentPageView {
  readonly method: Loaded<PaymentView>;
  /** Null inside for a business that gets no tax invoice (billed in dollars). */
  readonly details: Loaded<BillingDetailsView | null>;
  readonly canManage: boolean;
}

export async function loadPaymentPage(customer: CustomerContext): Promise<PaymentPageView> {
  const [method, details] = await Promise.all([load("billing.payment-method", () => loadPaymentMethod(customer)), load("billing.details", () => loadBillingDetailsView(customer))]);
  return { method, details, canManage: customer.role === "owner" };
}
