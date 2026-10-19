import "server-only";
import { discountCentsFor, isChargeableDiscount, normaliseReferralCode } from "@brandbasket/billing";
import {
  consumeRateLimit,
  findAffiliateById,
  findBillingState,
  findBusinessReferralCode,
  findRedeemableReferralCode,
  isPhoneAccountEmail,
  setBusinessReferralCode,
  type Affiliate,
  type Plan,
  type RateLimitRule,
  type ReferralCode,
  type ReferralDiscount,
} from "@brandbasket/db";
import type { SessionUser } from "@brandbasket/shared/lib/access";
import type { StepProblem } from "./onboarding";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/**
 * Applying a referral code. Every read and write here runs on the staff connection: `referral_codes` grants the
 * customer's own database role nothing, and `businesses.referral_code_id` is billing state, which customers never
 * write. The caller has already established that the signed-in customer owns the business.
 */

/** Guessing codes must not be free. Generous enough that a customer mistyping theirs is never locked out. */
export const REFERRAL_RATE_LIMIT: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };

/**
 * One message for every way a code can fail: unknown, inactive, expired, capped, wrong currency, malformed. A
 * message that distinguished them would turn this field into an oracle for which codes exist.
 */
const NOT_VALID = "That code isn’t valid. Check it with whoever gave it to you, or carry on without it.";
const TOO_MANY_ATTEMPTS = "That’s a lot of attempts in a short time. Please wait a little and try again.";
const ALREADY_PAID = "Your payment is already made, so a code can’t be added now. Email us and we’ll look into it.";
const NOTHING_TO_APPLY_TO = "There’s nothing to apply a code to right now.";
/** Only the affiliate ever sees this: it names their own code back to them, so it gives nothing away. */
const OWN_CODE = "That’s your own affiliate code, so it can’t be used on your own membership.";

/** The discount a business has applied, as the page shows it and as checkout freezes it. */
export interface AppliedDiscount {
  readonly codeId: string;
  readonly code: string;
  /**
   * What the code takes off, in the plan's minor units: a flat code's own amount, or a percentage resolved against
   * the plan's pre-tax price by discountCentsFor. This is the figure checkout freezes onto the subscription.
   */
  readonly amountCents: number;
  /**
   * The discount as the code states it, for the words beside the price. Never used for money. Null for an affiliate
   * code that gives no discount: it is still applied, so the member's payments earn its affiliate.
   */
  readonly stated: ReferralDiscount | null;
}

export type ReferralOutcome =
  | { readonly kind: "applied"; readonly discount: AppliedDiscount }
  | { readonly kind: "removed" }
  | { readonly kind: "refused"; readonly problem: StepProblem };

const REFERRAL_FIELD = "referralCode";

function refused(message: string, field: string | null = REFERRAL_FIELD): ReferralOutcome {
  return { kind: "refused", problem: { message, field } };
}

/**
 * What a code is worth against a plan, or null when it cannot be charged there. A code for another currency, or
 * one whose amount has since grown to meet or exceed the plan's price (or whose percentage rounds to nothing),
 * simply stops applying rather than crashing a customer's page or opening a checkout for nothing. An affiliate code
 * that gives no discount is worth 0 and still applies: the table only allows that shape on an affiliate code.
 */
export function discountFrom(code: ReferralCode, plan: Plan): AppliedDiscount | null {
  if (code.currency !== plan.currency) return null;
  if (code.discount === null) return { codeId: code.id, code: code.code, amountCents: 0, stated: null };
  const amountCents = discountCentsFor(code.discount, plan.initialAmountCents);
  if (!isChargeableDiscount(plan.initialAmountCents, amountCents)) return null;
  return { codeId: code.id, code: code.code, amountCents, stated: code.discount };
}

/**
 * The discount in force for a business right now, re-validated from scratch. Both the page and checkout call it, so
 * what the customer is shown and what they are charged come from one computation. A code that has been deactivated,
 * expired or capped since it was applied simply stops counting, and the full price is shown and charged.
 */
export async function resolveAppliedDiscount(
  businessId: string,
  plan: Plan,
  now: Date,
): Promise<AppliedDiscount | null> {
  const staffDb = getStaffDb();
  const applied = await findBusinessReferralCode(staffDb, businessId);
  if (applied === null) return null;
  const redeemable = await findRedeemableReferralCode(staffDb, {
    code: applied.code,
    currency: plan.currency,
    now,
  });
  if (redeemable === null || redeemable.id !== applied.id) return null;
  return discountFrom(redeemable, plan);
}

/**
 * True when the person applying a code is the affiliate it pays: the same proven phone number, or the same real
 * email address. An affiliate earning a share of their own membership is paying themselves a discount and a
 * commission at once. A phone account's email is a placeholder and never counts as a match.
 */
export function isOwnAffiliateCode(affiliate: Pick<Affiliate, "phone" | "email">, user: Pick<SessionUser, "phone" | "email">): boolean {
  if (affiliate.phone !== null && user.phone !== null && affiliate.phone === user.phone) return true;
  if (affiliate.email === null || isPhoneAccountEmail(user.email)) return false;
  return affiliate.email.trim().toLowerCase() === user.email.trim().toLowerCase();
}

/**
 * The code a business applied that no longer counts (turned off, expired, used up, its affiliate turned off, or no
 * longer chargeable against the plan), so the page can say why the discount went rather than let it vanish. Null
 * when no code is applied, or when the applied one still works.
 */
export async function findLapsedAppliedCode(businessId: string, plan: Plan, now: Date): Promise<string | null> {
  const applied = await findBusinessReferralCode(getStaffDb(), businessId);
  if (applied === null) return null;
  return (await resolveAppliedDiscount(businessId, plan, now)) === null ? applied.code : null;
}

/**
 * Applies a code the customer typed on Check and send or on Premium. Refused once the business has paid: from then on the
 * subscription's own frozen discount decides the money, and changing it here would only mislead.
 */
export async function applyReferralCodeFor(
  customer: GrantedCustomer,
  typed: string,
  now: Date,
): Promise<ReferralOutcome> {
  const { businessId } = customer.tenant;

  const limit = await consumeRateLimit(getAppDb(), `referral:business:${businessId}`, REFERRAL_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const code = normaliseReferralCode(typed);
  if (code === null) return refused(NOT_VALID);

  const staffDb = getStaffDb();
  const state = await findBillingState(staffDb, businessId);
  if (state === null) return refused(NOTHING_TO_APPLY_TO, null);
  // hasEverPaid is exactly "some subscription of this business was activated by a payment", which is the line
  // after which the frozen discount on that subscription, not this column, decides the money.
  if (state.hasEverPaid) return refused(ALREADY_PAID, null);
  if (state.plan === null) return refused(NOTHING_TO_APPLY_TO, null);

  const found = await findRedeemableReferralCode(staffDb, { code, currency: state.currency, now });
  if (found === null) return refused(NOT_VALID);

  const discount = discountFrom(found, state.plan);
  if (discount === null) return refused(NOT_VALID);

  if (found.affiliateId !== null) {
    const affiliate = await findAffiliateById(staffDb, found.affiliateId);
    if (affiliate === null) return refused(NOT_VALID);
    if (isOwnAffiliateCode(affiliate, customer.user)) return refused(OWN_CODE);
  }

  const applied = await setBusinessReferralCode(staffDb, { businessId, referralCodeId: found.id });
  if (!applied) return refused(NOTHING_TO_APPLY_TO, null);
  return { kind: "applied", discount };
}

/** Takes the applied code off again. Refused once the business has paid, for the same reason as applying one. */
export async function removeReferralCodeFor(customer: GrantedCustomer): Promise<ReferralOutcome> {
  const { businessId } = customer.tenant;
  const staffDb = getStaffDb();
  const state = await findBillingState(staffDb, businessId);
  if (state === null) return refused(NOTHING_TO_APPLY_TO, null);
  if (state.hasEverPaid) return refused(ALREADY_PAID, null);
  await setBusinessReferralCode(staffDb, { businessId, referralCodeId: null });
  return { kind: "removed" };
}
