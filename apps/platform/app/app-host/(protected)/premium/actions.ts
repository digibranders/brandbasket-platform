"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CARE_PATH, MEMBER_HOME, MEMBERSHIP_PATH, UPGRADE_PATH, readMembershipCallbackTier, type MembershipFormState } from "@/lib/membership";
import { offersChoice, sellsFreeListing } from "@/lib/brand";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { MONTHLY_ADD_ON_IDS } from "@fynix/shared/lib/billing/add-ons";
import { startAddOnCheckoutFor } from "@/lib/server/add-ons";
import { startMembershipCheckoutFor } from "@/lib/server/checkout";
import { LISTING_PAGE_PATH, requireCustomerAccess, type CustomerAccessOptions } from "@/lib/server/customer-access";
import { continueWithFreeListing } from "@/lib/server/membership";
import { applyReferralCodeFor, removeReferralCodeFor } from "@/lib/server/referrals";
import { requestBrand } from "@/lib/server/request-brand";

/** The plan pages' actions are open to the two accounts the pages are: a free listing account, held here or not. */
const MEMBERSHIP_PAGE: CustomerAccessOptions = { listingAccount: "allow", membershipCheckout: "allow" };

/** A code is applied or removed from either plan's page or from the Upgrade page, and all show the price it makes. */
function revalidatePlanPages(): void {
  revalidatePath(MEMBERSHIP_PATH);
  revalidatePath(CARE_PATH);
  revalidatePath(UPGRADE_PATH);
}

const UNKNOWN_ADD_ON_MESSAGE = "We couldn't tell which add-on that was. Reload the page and try again.";
const UNKNOWN_PLAN_MESSAGE = "We couldn't tell which plan that was. Reload the page and try again.";

/**
 * Buy a plan, Care or Premium: starts its first payment. The only thing read from the posted form is which plan's page
 * the button was on, and that is checked here; whether this business may pay, and what for, is decided on the server
 * in startMembershipCheckoutFor. On success the owner is sent to the provider's checkout, and the payment's
 * confirmation opens the membership.
 */
export async function startMembership(_previous: MembershipFormState, formData: FormData): Promise<MembershipFormState> {
  const tier = readMembershipCallbackTier(typeof formData.get("tier") === "string" ? String(formData.get("tier")) : null);
  if (tier === null) return { status: "error", message: UNKNOWN_PLAN_MESSAGE };
  if (!offersChoice(await requestBrand(), tier)) return { status: "error", message: UNKNOWN_PLAN_MESSAGE };
  const customer = await requireCustomerAccess(MEMBERSHIP_PAGE);
  const outcome = await startMembershipCheckoutFor(customer, new Date(), tier);
  if (outcome.kind === "refused") return { status: "error", message: outcome.problem.message };
  redirect(outcome.url);
}

const OFFER_ADD_ONS = MONTHLY_ADD_ON_IDS;

/**
 * Adds one add-on at the first checkout (lib/billing/lifetime-offer.ts): opens its payment, priced with the 5% lifetime
 * offer. The form carries only which add-on; whether the offer still stands, and the price, are decided on the server
 * (startAddOnCheckoutFor, startPressReleaseFor), so a form posted after the first plan payment buys it at full price.
 */
export async function addOfferAddOn(_previous: MembershipFormState, formData: FormData): Promise<MembershipFormState> {
  const addOn = OFFER_ADD_ONS.find((candidate) => candidate === formData.get("addOn"));
  if (addOn === undefined) return { status: "error", message: UNKNOWN_ADD_ON_MESSAGE };
  const customer = await requireCustomerAccess(MEMBERSHIP_PAGE);
  const outcome = await startAddOnCheckoutFor(customer, addOn, "buy", new Date());
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  redirect(outcome.url);
}

/**
 * Applies a coupon or an affiliate code before paying, so the Pay button can show the price the member will be
 * charged. Everything is checked again in applyReferralCodeFor, and again under the lock when the checkout opens.
 */
export async function applyMembershipCode(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const customer = await requireCustomerAccess(MEMBERSHIP_PAGE);
  const typed = formData.get("referralCode");
  const outcome = await applyReferralCodeFor(customer, typeof typed === "string" ? typed : "", new Date());
  if (outcome.kind === "refused") return refusedStepState(outcome.problem, formData);
  revalidatePlanPages();
  return { status: "idle" };
}

/** Takes an applied code off again, before paying. */
export async function removeMembershipCode(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const customer = await requireCustomerAccess(MEMBERSHIP_PAGE);
  const outcome = await removeReferralCodeFor(customer);
  if (outcome.kind === "refused") return refusedStepState(outcome.problem, formData);
  revalidatePlanPages();
  return { status: "idle" };
}

/**
 * "Continue with the free listing", for an owner who chose Care or Premium at sign-up and is held on a plan's page: their business
 * becomes an ordinary free listing account and its dashboard opens. Premium stays one click away there.
 */
export async function chooseFreeListing(): Promise<void> {
  // The Fynix host sells no free listing: its page has no such button, and a form posted without one is sent back to the plan.
  if (!sellsFreeListing(await requestBrand())) redirect(MEMBER_HOME);
  const customer = await requireCustomerAccess(MEMBERSHIP_PAGE);
  const free = await continueWithFreeListing(customer);
  // The layout drew this account without a dashboard; it has one now, so the layout is drawn again, not reused.
  revalidatePath("/", "layout");
  // Not a free listing account any more: a payment landed in the meantime and it is a member, whose home is its own.
  redirect(free ? LISTING_PAGE_PATH : MEMBER_HOME);
}
