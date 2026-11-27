import "server-only";
import { resolveBillingProviderName } from "@brandbasket/billing";
import {
  type BillingProviderName,
  type PaymentLink,
  type ReferralCode,
  extendPaymentLink,
  findBillingState,
  findClientDetail,
  findLead,
  findDealForBusiness,
  findOpenPaymentLinkForBusiness,
  findPaymentLinkById,
  findReferralCodeById,
  insertPaymentLink,
  listPaymentLinks,
  listReferralCodes,
  listStaffRoster,
  paymentLinkState,
  revokePaymentLink,
  updateDeal,
} from "@brandbasket/db";
import { cancelPendingDealCheckout } from "@brandbasket/shared/server/deal-checkout";
import { hashLinkToken, newLinkToken } from "@brandbasket/shared/server/link-token";
import { addOnById } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { type PaymentLinkDraft, type PaymentLinkField, couponProblem } from "@/lib/payment-link-form";
import { type PaymentLinkRow, toPaymentLinkRow } from "@/lib/payment-link-rows";
import { customPricesOf, summariseLink, SUMMARY_REFUSALS } from "@/lib/payment-link-summary";
import { recordStaffAction } from "./activity";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";
import type { GrantedStaff } from "./staff-access";

/** A link is single use and lasts this many days; staff can extend it by as many again from the day they do (plan 65, D10). */
export const PAYMENT_LINK_DAYS = 7;
const DAY_MS = 86_400_000;

/** The listed page of links: enough to see what is open and what just closed. */
const LIST_LIMIT = 200;

/** The provider the console bills through: the first-month offer is not given on bank transfer, so the summary needs its name. */
export function activeProviderName(): BillingProviderName {
  return resolveBillingProviderName({
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    BRANDBASKET_ALLOW_FAKE_BILLING: process.env.BRANDBASKET_ALLOW_FAKE_BILLING,
  });
}

export type PaymentLinkOutcome =
  | { readonly kind: "created"; readonly link: PaymentLink; /** Shown to staff once, in the address. Never stored. */ readonly token: string }
  | { readonly kind: "refused"; readonly field: PaymentLinkField | null; readonly message: string };

const refused = (message: string, field: PaymentLinkField | null = null): PaymentLinkOutcome => ({ kind: "refused", field, message });

export interface CreatePaymentLinkInput {
  /** What parsePaymentLinkForm returned: already checked for shape, services, the fee and its note. */
  readonly form: PaymentLinkDraft;
  readonly staff: GrantedStaff;
  /** The enquiry the link was made from, for a new customer. */
  readonly leadId?: string | null;
  /** An account that signed up and never paid. */
  readonly businessId?: string | null;
  readonly now: Date;
}

/**
 * Makes a payment link and returns its token once. The caller has already required the money capability. Refuses a business that has
 * ever paid (it is a reactivation, not a first sale) and one that already holds an open link (staff cancel the older one first), and
 * checks the coupon: it must be a coupon in the link's currency, on and unexpired, and the shared first-payment rule must accept it.
 */
export async function createPaymentLinkFor(input: CreatePaymentLinkInput): Promise<PaymentLinkOutcome> {
  const { form, staff, now } = input;
  const leadId = input.leadId ?? null;
  const businessId = input.businessId ?? null;
  const db = getStaffDb();

  if (leadId !== null && (await findLead(db, leadId)) === null) return refused("That enquiry no longer exists.");
  if (businessId !== null) {
    const state = await findBillingState(db, businessId);
    if (state === null) return refused("That business no longer exists.");
    if (state.hasEverPaid) return refused("This business has paid before. A payment link is for a first purchase.");
    // Plan 66: a deal whose advance is paid is being built; it is edited (step 6), never replaced by a second link.
    if ((await findDealForBusiness(db, businessId)) !== null) {
      return refused("This business has a deal in progress: its advance is paid. A new payment link cannot be made for it.");
    }
    if ((await findOpenPaymentLinkForBusiness(db, businessId, now)) !== null) {
      return refused("This business already has an open payment link. Cancel it first, then make a new one.");
    }
  }

  let coupon: ReferralCode | null = null;
  if (form.couponId !== null) {
    coupon = await findReferralCodeById(db, form.couponId);
    if (coupon === null) return refused("That coupon no longer exists.", "couponId");
    const problem = couponProblem(coupon, form.currency, now);
    if (problem !== null) return refused(problem, "couponId");
  }

  // The same arithmetic the form's live summary ran: a deal the first-payment rule would refuse never becomes a link.
  const summary = summariseLink({
    services: form.services,
    interval: form.billingInterval,
    currency: form.currency,
    websiteKind: form.websiteKind,
    build:
      form.dealType === "paid" && form.setupFeeListCents !== null && form.advanceCents !== null
        ? { listCents: form.setupFeeListCents, discountCents: form.setupFeeDiscountCents ?? 0, advanceCents: form.advanceCents }
        : null,
    customPrices: customPricesOf(form),
    coupon: coupon === null || coupon.discount === null ? null : { discount: coupon.discount, discountMonths: coupon.discountMonths },
    provider: activeProviderName(),
  });
  if (summary.kind === "refused") return refused(SUMMARY_REFUSALS[summary.reason], summary.reason === "coupon-with-custom-price" ? null : "couponId");

  const token = newLinkToken();
  const { customer } = form;
  const link = await insertPaymentLink(db, {
    tokenHash: hashLinkToken(token),
    leadId,
    businessId,
    contactName: customer.contactName,
    businessName: customer.businessName,
    email: customer.email,
    phoneCountry: customer.phoneCountry,
    phone: customer.phone,
    countryCode: form.countryCode,
    stateCode: customer.stateCode,
    gstin: customer.gstin,
    legalName: customer.legalName,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    postalCode: customer.postalCode,
    city: customer.city,
    currency: form.currency,
    services: [...form.services],
    billingInterval: form.billingInterval,
    dealType: form.dealType,
    advanceCents: form.advanceCents,
    websiteKind: form.websiteKind,
    setupFeeListCents: form.setupFeeListCents,
    setupFeeDiscountCents: form.setupFeeDiscountCents,
    setupFeeNote: form.setupFeeNote,
    websitePriceCents: form.websitePriceCents,
    socialPriceCents: form.socialPriceCents,
    adsPriceCents: form.adsPriceCents,
    monitoringPriceCents: form.monitoringPriceCents,
    referralCodeId: coupon?.id ?? null,
    expiresAt: new Date(now.getTime() + PAYMENT_LINK_DAYS * DAY_MS),
    createdByStaffId: staff.user.id,
  });
  await recordStaffAction(staff, {
    businessId,
    kind: "payment_link.created",
    summary: "Created a payment link",
    data: {
      linkId: link.id,
      dealType: form.dealType,
      setupFeeListCents: form.setupFeeListCents,
      setupFeeDiscountCents: form.setupFeeDiscountCents,
      advanceCents: form.advanceCents,
      websitePriceCents: form.websitePriceCents,
      socialPriceCents: form.socialPriceCents,
      adsPriceCents: form.adsPriceCents,
      monitoringPriceCents: form.monitoringPriceCents,
    },
  });
  return { kind: "created", link, token };
}

export type DealEditOutcome =
  | { readonly kind: "saved"; readonly businessId: string | null; readonly changed: readonly string[] }
  | { readonly kind: "refused"; readonly field: PaymentLinkField | null; readonly message: string }
  | { readonly kind: "not-found" };

export interface UpdateDealInput {
  /** What parsePaymentLinkForm returned for the edit form (with the advance fixed): checked again here, because the form is a courtesy. */
  readonly form: PaymentLinkDraft;
  readonly linkId: string;
  readonly staff: GrantedStaff;
  readonly now: Date;
}

const NOT_EDITABLE: Readonly<Record<string, string>> = {
  balance_due: "This deal is marked ready, so the customer may already be paying the balance. Undo ready on the Website tab first, then edit it.",
  paid: "This deal is paid. It can no longer be edited.",
  revoked: "This deal was cancelled. It can no longer be edited.",
  open: "The advance of this deal is not paid yet. Cancel the link and make a new one to change it.",
  expired: "The advance of this deal is not paid yet. Cancel the link and make a new one to change it.",
};

/** What a deal edit changed, in words and in the link's currency, for the staff action's summary. Empty when nothing changed. */
function dealChanges(before: PaymentLink, form: PaymentLinkDraft): string[] {
  const money = (cents: number | null): string => (cents === null ? "list" : formatMoney(cents, before.currency));
  const net = (list: number | null, discount: number | null): number | null => (list === null ? null : list - (discount ?? 0));
  const changes: string[] = [];
  const services = (ids: readonly string[]): string => readBundleSelection(ids).map((id) => addOnById(id).title).join(", ");
  if (services(before.services) !== services(form.services)) changes.push(`services ${services(before.services)} to ${services(form.services)}`);
  if (before.billingInterval !== form.billingInterval) changes.push(`billing ${before.billingInterval === "year" ? "yearly" : "monthly"} to ${form.billingInterval === "year" ? "yearly" : "monthly"}`);
  if (before.websiteKind !== form.websiteKind) changes.push(`website kind ${before.websiteKind ?? "none"} to ${form.websiteKind ?? "none"}`);
  if (before.setupFeeListCents !== form.setupFeeListCents) changes.push(`build price ${money(before.setupFeeListCents)} to ${money(form.setupFeeListCents)}`);
  if ((before.setupFeeDiscountCents ?? 0) !== (form.setupFeeDiscountCents ?? 0)) changes.push(`build discount ${money(before.setupFeeDiscountCents ?? 0)} to ${money(form.setupFeeDiscountCents ?? 0)}`);
  const beforeNet = net(before.setupFeeListCents, before.setupFeeDiscountCents);
  const afterNet = net(form.setupFeeListCents, form.setupFeeDiscountCents);
  if (beforeNet !== afterNet) changes.push(`net build price ${money(beforeNet)} to ${money(afterNet)}`);
  if ((before.setupFeeNote ?? null) !== (form.setupFeeNote ?? null)) changes.push("discount note");
  if ((before.referralCodeId ?? null) !== form.couponId) changes.push("coupon");
  const prices = [
    ["Website", before.websitePriceCents, form.websitePriceCents],
    ["Social Media", before.socialPriceCents, form.socialPriceCents],
    ["Paid Ads", before.adsPriceCents, form.adsPriceCents],
    ["Monitoring", before.monitoringPriceCents, form.monitoringPriceCents],
  ] as const;
  for (const [name, was, now] of prices) if (was !== now) changes.push(`${name} price ${money(was)} to ${money(now)}`);
  return changes;
}

/**
 * Edits a paid deal while its website is being built (plan 66, O8). Allowed only in `building`: advance paid, not marked ready, not paid,
 * not cancelled (after "Website ready", staff undo it first). The advance never changes, and the new net build price may not fall below
 * it, so the balance is never negative. The edited deal goes through the same coupon check and summariseLink as a new link, so a
 * combination the first-payment rule refuses never saves. Records `payment_link.edited` with what changed, and ends any checkout the
 * customer had opened for the old deal.
 */
export async function updateDealFor(input: UpdateDealInput): Promise<DealEditOutcome> {
  const { form, staff, now } = input;
  const db = getStaffDb();
  const link = await findPaymentLinkById(db, input.linkId);
  if (link === null) return { kind: "not-found" };
  const refuse = (message: string, field: PaymentLinkField | null = null): DealEditOutcome => ({ kind: "refused", field, message });

  const state = paymentLinkState(link, now);
  if (state !== "building") return refuse(NOT_EDITABLE[state] ?? "This deal cannot be edited.");
  if (link.dealType !== "paid" || link.advanceCents === null) return refuse("Only a paid deal can be edited.");
  if (form.dealType !== "paid" || form.setupFeeListCents === null || form.advanceCents === null) return refuse("Only a paid deal can be edited.");
  if (form.advanceCents !== link.advanceCents) return refuse("The advance has been paid and cannot be changed.", "advanceValue");
  if (form.currency !== link.currency) return refuse("The country, and so the currency, cannot be changed once the advance is paid.", "countryCode");
  if (!form.services.includes("managed-website")) return refuse("A paid deal keeps Website Management.", "service");
  const netCents = form.setupFeeListCents - (form.setupFeeDiscountCents ?? 0);
  if (netCents < link.advanceCents) {
    return refuse(
      `The build price after the discount, ${formatMoney(netCents, link.currency)}, is less than the advance already paid, ${formatMoney(link.advanceCents, link.currency)}. The balance cannot be negative.`,
      "buildPrice",
    );
  }

  let coupon: ReferralCode | null = null;
  if (form.couponId !== null) {
    coupon = await findReferralCodeById(db, form.couponId);
    if (coupon === null) return refuse("That coupon no longer exists.", "couponId");
    const problem = couponProblem(coupon, form.currency, now);
    if (problem !== null) return refuse(problem, "couponId");
  }
  const summary = summariseLink({
    services: form.services,
    interval: form.billingInterval,
    currency: form.currency,
    websiteKind: form.websiteKind,
    build: { listCents: form.setupFeeListCents, discountCents: form.setupFeeDiscountCents ?? 0, advanceCents: link.advanceCents },
    customPrices: customPricesOf(form),
    coupon: coupon === null || coupon.discount === null ? null : { discount: coupon.discount, discountMonths: coupon.discountMonths },
    provider: activeProviderName(),
  });
  if (summary.kind === "refused") return refuse(SUMMARY_REFUSALS[summary.reason], summary.reason === "coupon-with-custom-price" ? null : "couponId");

  const changed = dealChanges(link, form);
  const saved = await updateDeal(db, {
    linkId: link.id,
    patch: {
      services: [...form.services],
      billingInterval: form.billingInterval,
      websiteKind: form.websiteKind,
      setupFeeListCents: form.setupFeeListCents,
      setupFeeDiscountCents: form.setupFeeDiscountCents,
      setupFeeNote: form.setupFeeNote,
      referralCodeId: form.couponId,
      websitePriceCents: form.websitePriceCents,
      socialPriceCents: form.socialPriceCents,
      adsPriceCents: form.adsPriceCents,
      monitoringPriceCents: form.monitoringPriceCents,
    },
  });
  // Staff marked it ready, or another edit raced this one: the deal is no longer building.
  if (!saved) return refuse(NOT_EDITABLE.balance_due ?? "This deal can no longer be edited.");
  if (link.businessId !== null) await cancelPendingDealCheckout(db, getBillingProvider(), { businessId: link.businessId, linkId: link.id, now });
  await recordStaffAction(staff, {
    businessId: link.businessId,
    kind: "payment_link.edited",
    summary: changed.length === 0 ? "Saved the deal with no changes" : `Edited the deal: ${changed.join("; ")}`,
    data: {
      linkId: link.id,
      changed,
      before: { services: link.services, billingInterval: link.billingInterval, setupFeeListCents: link.setupFeeListCents, setupFeeDiscountCents: link.setupFeeDiscountCents, referralCodeId: link.referralCodeId, websitePriceCents: link.websitePriceCents, socialPriceCents: link.socialPriceCents, adsPriceCents: link.adsPriceCents, monitoringPriceCents: link.monitoringPriceCents },
      after: { services: form.services, billingInterval: form.billingInterval, setupFeeListCents: form.setupFeeListCents, setupFeeDiscountCents: form.setupFeeDiscountCents, referralCodeId: form.couponId, websitePriceCents: form.websitePriceCents, socialPriceCents: form.socialPriceCents, adsPriceCents: form.adsPriceCents, monitoringPriceCents: form.monitoringPriceCents },
    },
  });
  return { kind: "saved", businessId: link.businessId, changed };
}

export type PaymentLinkChange = "done" | "not-found" | "not-open" | "business-has-another";

/** Cancels a link that is not paid yet. A cancelled link opens nothing, even if the address was already sent. */
export async function revokePaymentLinkFor(input: { readonly linkId: string; readonly staff: GrantedStaff; readonly now: Date }): Promise<PaymentLinkChange> {
  const db = getStaffDb();
  const link = await findPaymentLinkById(db, input.linkId);
  if (link === null) return "not-found";
  if (!(await revokePaymentLink(db, { linkId: link.id, staffUserId: input.staff.user.id, now: input.now }))) return "not-open";
  // Plan 66: a checkout the customer opened for the balance is no longer the deal, so it cannot be paid (the advance is kept, O9).
  if (link.businessId !== null) await cancelPendingDealCheckout(db, getBillingProvider(), { businessId: link.businessId, linkId: link.id, now: input.now });
  await recordStaffAction(input.staff, { businessId: link.businessId, kind: "payment_link.cancelled", summary: "Cancelled a payment link", data: { linkId: link.id } });
  return "done";
}

/** Gives an unpaid, uncancelled link (an expired one too) seven more days from now. */
export async function extendPaymentLinkFor(input: { readonly linkId: string; readonly staff: GrantedStaff; readonly now: Date }): Promise<PaymentLinkChange> {
  const db = getStaffDb();
  const link = await findPaymentLinkById(db, input.linkId);
  if (link === null) return "not-found";
  if (link.businessId !== null) {
    // Bringing an expired link back must not leave the business with two open ones.
    const open = await findOpenPaymentLinkForBusiness(db, link.businessId, input.now);
    if (open !== null && open.id !== link.id) return "business-has-another";
  }
  const expiresAt = new Date(input.now.getTime() + PAYMENT_LINK_DAYS * DAY_MS);
  if (!(await extendPaymentLink(db, { linkId: link.id, expiresAt }))) return "not-open";
  await recordStaffAction(input.staff, {
    businessId: link.businessId,
    kind: "payment_link.extended",
    summary: "Extended a payment link by 7 days",
    data: { linkId: link.id, expiresAt: expiresAt.toISOString() },
  });
  return "done";
}

/** The list page's rows, newest first. The token is not among them: only its hash is stored. */
export async function loadPaymentLinkRows(now: Date): Promise<readonly PaymentLinkRow[]> {
  const db = getStaffDb();
  const [links, coupons, roster] = await Promise.all([
    listPaymentLinks(db, { limit: LIST_LIMIT, offset: 0 }),
    listReferralCodes(db, "coupon", LIST_LIMIT),
    listStaffRoster(db),
  ]);
  const couponById = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  const staffName = new Map(roster.map((member) => [member.userId, member.name]));
  const provider = activeProviderName();
  return links.map((link) => toPaymentLinkRow(link, { now, provider, coupon: link.referralCodeId === null ? null : (couponById.get(link.referralCodeId) ?? null), createdBy: staffName.get(link.createdByStaffId) ?? "Former staff" }));
}

/** What the create form opens with, from an enquiry or from an account that never paid. `values` are form field names. */
export interface PaymentLinkPrefill {
  readonly leadId: string | null;
  readonly businessId: string | null;
  readonly values: Readonly<Record<string, string>>;
  /** Why no link can be made for what was asked, or null. */
  readonly blocked: string | null;
}

export async function loadPaymentLinkPrefill(input: { readonly leadId: string | null; readonly businessId: string | null; readonly now: Date }): Promise<PaymentLinkPrefill> {
  const db = getStaffDb();
  const blank: PaymentLinkPrefill = { leadId: null, businessId: null, values: {}, blocked: null };

  if (input.businessId !== null) {
    const [client, state] = await Promise.all([findClientDetail(db, input.businessId), findBillingState(db, input.businessId)]);
    if (client === null || state === null) return { ...blank, blocked: "That business no longer exists." };
    if (state.hasEverPaid) return { ...blank, blocked: "This business has paid before. A payment link is for a first purchase." };
    if ((await findOpenPaymentLinkForBusiness(db, input.businessId, input.now)) !== null) {
      return { ...blank, blocked: "This business already has an open payment link. Cancel it from the Payment links list first." };
    }
    const india = client.currency === "INR";
    return {
      ...blank,
      businessId: input.businessId,
      values: {
        ...(india ? { countryCode: HOME_COUNTRY, phoneCountry: HOME_COUNTRY } : {}),
        businessName: client.businessName,
        contactName: client.owner?.name ?? "",
        email: client.owner?.email ?? "",
        phone: client.owner?.phone ?? "",
      },
    };
  }

  if (input.leadId !== null) {
    const lead = await findLead(db, input.leadId);
    if (lead === null) return { ...blank, blocked: "That enquiry no longer exists." };
    const india = lead.currency === "INR";
    return {
      ...blank,
      leadId: lead.id,
      values: {
        ...(india ? { countryCode: HOME_COUNTRY, phoneCountry: HOME_COUNTRY } : {}),
        businessName: lead.businessName,
        contactName: lead.name,
        email: lead.email,
        phone: lead.phone ?? "",
        city: lead.city ?? "",
      },
    };
  }
  return blank;
}

export interface DealEditPage {
  readonly link: PaymentLink;
  /** Form field names to the deal's values, for the create form to open with. */
  readonly values: Readonly<Record<string, string>>;
  /** Why the deal cannot be edited now, or null. */
  readonly blocked: string | null;
}

const wholeMajor = (cents: number | null): string => (cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** The deal as the edit form opens: its own terms, never the customer's details (they are not edited here). Null when the link is gone. */
export async function loadDealEditPage(linkId: string, now: Date): Promise<DealEditPage | null> {
  const link = await findPaymentLinkById(getStaffDb(), linkId);
  if (link === null) return null;
  const state = paymentLinkState(link, now);
  const blocked = state !== "building" ? (NOT_EDITABLE[state] ?? null) : link.dealType !== "paid" ? "Only a paid deal can be edited." : null;
  const discount = link.setupFeeDiscountCents ?? 0;
  return {
    link,
    blocked,
    values: {
      countryCode: link.countryCode ?? "",
      service: link.services.join(","),
      websiteKind: link.websiteKind ?? "",
      billingInterval: link.billingInterval,
      dealType: "paid",
      buildPrice: wholeMajor(link.setupFeeListCents),
      discountKind: discount > 0 ? "amount" : "none",
      discountValue: discount > 0 ? wholeMajor(discount) : "",
      setupFeeNote: link.setupFeeNote ?? "",
      advanceKind: "amount",
      advanceValue: wholeMajor(link.advanceCents),
      websitePrice: wholeMajor(link.websitePriceCents),
      socialPrice: wholeMajor(link.socialPriceCents),
      adsPrice: wholeMajor(link.adsPriceCents),
      monitoringPrice: wholeMajor(link.monitoringPriceCents),
      couponId: link.referralCodeId ?? "",
    },
  };
}
