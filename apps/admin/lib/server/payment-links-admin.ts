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
  findOpenPaymentLinkForBusiness,
  findPaymentLinkById,
  findReferralCodeById,
  insertPaymentLink,
  listPaymentLinks,
  listReferralCodes,
  listStaffRoster,
  revokePaymentLink,
} from "@brandbasket/db";
import { hashLinkToken, newLinkToken } from "@brandbasket/shared/server/link-token";
import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { type PaymentLinkDraft, type PaymentLinkField, couponProblem } from "@/lib/payment-link-form";
import { type PaymentLinkRow, toPaymentLinkRow } from "@/lib/payment-link-rows";
import { summariseLink, SUMMARY_REFUSALS } from "@/lib/payment-link-summary";
import { recordStaffAction } from "./activity";
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
    buildDiscountCents: form.setupFeeDiscountCents ?? 0,
    coupon: coupon === null || coupon.discount === null ? null : { discount: coupon.discount, discountMonths: coupon.discountMonths },
    provider: activeProviderName(),
  });
  if (summary.kind === "refused") return refused(SUMMARY_REFUSALS[summary.reason], "couponId");

  // A fully waived fee leaves nothing to take in advance, so it is a free deal.
  const netFeeCents = form.setupFeeListCents === null ? 0 : form.setupFeeListCents - (form.setupFeeDiscountCents ?? 0);
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
    // Temporary mapping, plan 66 step 3 replaces this: a link with a fee is a paid deal whose advance is the whole net fee, one without is free.
    dealType: netFeeCents > 0 ? "paid" : "free",
    advanceCents: netFeeCents > 0 ? netFeeCents : null,
    websiteKind: form.websiteKind ?? (form.services.includes("managed-website") ? "b2b" : null),
    setupFeeListCents: netFeeCents > 0 ? form.setupFeeListCents : null,
    setupFeeDiscountCents: netFeeCents > 0 ? form.setupFeeDiscountCents : null,
    setupFeeNote: netFeeCents > 0 ? form.setupFeeNote : null,
    referralCodeId: coupon?.id ?? null,
    expiresAt: new Date(now.getTime() + PAYMENT_LINK_DAYS * DAY_MS),
    createdByStaffId: staff.user.id,
  });
  await recordStaffAction(staff, {
    businessId,
    kind: "payment_link.created",
    summary: "Created a payment link",
    data: { linkId: link.id, setupFeeListCents: form.setupFeeListCents, setupFeeDiscountCents: form.setupFeeDiscountCents },
  });
  return { kind: "created", link, token };
}

export type PaymentLinkChange = "done" | "not-found" | "not-open" | "business-has-another";

/** Cancels a link that is not paid yet. A cancelled link opens nothing, even if the address was already sent. */
export async function revokePaymentLinkFor(input: { readonly linkId: string; readonly staff: GrantedStaff; readonly now: Date }): Promise<PaymentLinkChange> {
  const db = getStaffDb();
  const link = await findPaymentLinkById(db, input.linkId);
  if (link === null) return "not-found";
  if (!(await revokePaymentLink(db, { linkId: link.id, staffUserId: input.staff.user.id, now: input.now }))) return "not-open";
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
