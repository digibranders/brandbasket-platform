"use server";

import { WEBSITE_ALONE, readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { formDataObject } from "@/lib/form";
import { requireCustomer } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { chargeNoticeHref, chargePayPath } from "./rules/charge-notices";
import { MEMBERSHIP_PATH } from "./rules/membership";
import { lookupBillingPincode, saveBillingDetailsFor, type BillingPincodeLookup } from "./server/billing-details";
import { startCustomerChargePayment } from "./server/charges";
import { startCheckoutFor, startMembershipCheckoutFor } from "./server/checkout";
import { loadBusinessEntry } from "./server/entry";
import { applyReferralCodeFor, removeReferralCodeFor } from "./server/referrals";

/*
 * The checkout's actions, ported from apps/platform app/app-host/(protected)/plan/actions.ts, onboarding/review/actions.ts and
 * billing/actions.ts. Nothing about money is read from a form: the basket (catalogue ids only), the code and the package offer
 * are priced again on the server, and again under the business's billing lock when the checkout opens.
 */

const UNKNOWN_PLAN_MESSAGE = "We couldn't tell which plan that was. Reload the page and try again.";
const SAVE_FAILED_MESSAGE = "We couldn't save your billing details just now. Please try again in a minute.";

/** The basket a form names: at most the catalogue's services, as short strings. Anything else reads as no basket. */
const ServiceList = z.union([z.string().max(40), z.array(z.string().max(40)).max(10)]).optional();
const PayForm = z.object({ tier: z.literal("managed", { error: UNKNOWN_PLAN_MESSAGE }), service: ServiceList });
const CodeForm = z.object({ referralCode: z.string().max(64).default(""), service: ServiceList });

function servicesOf(value: z.output<typeof ServiceList>) {
  return readBundleSelection(value === undefined ? [] : Array.isArray(value) ? value : [value]);
}

/**
 * Pay. A business billed in rupees gets its first tax invoice from its billing details, which cannot change once issued: when
 * the form carries them they are saved first (a refused field comes back under its input), and the checkout refuses a business
 * with none saved whatever was posted. A sign-up account buys its basket (startMembershipCheckoutFor); a website client invited
 * by staff buys the website alone, with its setup checked first while it is still open (startCheckoutFor). Both share the
 * checkout rate limit. On success the customer is sent to the provider.
 */
export async function startPaymentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireCustomer();
  const parsed = PayForm.safeParse(formDataObject(formData));
  if (!parsed.success) return actionFail(UNKNOWN_PLAN_MESSAGE);
  if (formData.has("addressLine1")) {
    const saved = await saveBillingDetailsSafely(customer, formData);
    if (!saved.ok) return saved;
  }
  const entry = await loadBusinessEntry(customer);
  const now = new Date();
  const outcome =
    entry.kind === "listing"
      ? await startMembershipCheckoutFor(customer, now, parsed.data.tier, servicesOf(parsed.data.service))
      : await startCheckoutFor(customer, now);
  if (outcome.kind === "refused") return actionFail(outcome.problem.message);
  redirect(outcome.url);
}

/**
 * Applies a coupon or an affiliate code before paying, so the Pay button shows the price the checkout will take. A sign-up
 * account's code is priced against the basket the page posts; a website client's against the website alone. Everything is
 * checked again in applyReferralCodeFor (20 tries an hour, one message for every invalid code), and again when the checkout opens.
 */
export async function applyCodeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireCustomer();
  const parsed = CodeForm.safeParse(formDataObject(formData));
  if (!parsed.success) return actionFail("That code isn’t valid. Check it with whoever gave it to you, or carry on without it.", { referralCode: "Enter the code again." });
  const entry = await loadBusinessEntry(customer);
  const services = entry.kind === "listing" ? servicesOf(parsed.data.service) : WEBSITE_ALONE;
  const outcome = await applyReferralCodeFor(customer, parsed.data.referralCode, services, new Date());
  if (outcome.kind === "refused") {
    const { message, field } = outcome.problem;
    return actionFail(message, field === null ? undefined : { [field]: message });
  }
  revalidatePath(MEMBERSHIP_PATH);
  return actionOk();
}

/** Takes an applied code off again, before paying. Refused once the business has paid. */
export async function removeCodeAction(): Promise<ActionResult> {
  const customer = await requireCustomer();
  const outcome = await removeReferralCodeFor(customer);
  if (outcome.kind === "refused") return actionFail(outcome.problem.message);
  revalidatePath(MEMBERSHIP_PATH);
  return actionOk();
}

/** Saves billing details on their own (Plan & billing uses this too). */
export async function saveBillingDetailsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireCustomer();
  const saved = await saveBillingDetailsSafely(customer, formData);
  if (saved.ok) revalidatePath(MEMBERSHIP_PATH);
  return saved;
}

async function saveBillingDetailsSafely(customer: Awaited<ReturnType<typeof requireCustomer>>, formData: FormData): Promise<ActionResult> {
  try {
    return await saveBillingDetailsFor(customer, formData);
  } catch (error) {
    reportError(error, { area: "checkout.billing-details" });
    return actionFail(SAVE_FAILED_MESSAGE);
  }
}

/** Looks a pincode up so the billing form can fill the state and suggest the city. Needs a signed-in customer; reads no business data. */
export async function lookupPincodeAction(pincode: unknown): Promise<ActionResult<BillingPincodeLookup>> {
  await requireCustomer();
  if (typeof pincode !== "string") return actionOk({ kind: "not-found" } as const);
  return actionOk(await lookupBillingPincode(pincode));
}

const ChargeForm = z.object({ chargeId: z.uuid() });

/**
 * Pay one of the customer's open charges (Plan & billing posts this). A form post, so opening a payment only happens on
 * purpose. The charge id is checked against the signed-in customer's own charges, through row-level security; the amount
 * comes from the charge row. Razorpay opens on /checkout/charges/<id>; the fake provider's test page is its own address.
 */
export async function payChargeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const customer = await requireCustomer();
  const parsed = ChargeForm.safeParse(formDataObject(formData));
  if (!parsed.success) notFound();
  const started = await startCustomerChargePayment(customer, parsed.data.chargeId);
  switch (started.kind) {
    case "not-found":
      notFound();
    case "not-open":
      redirect(chargeNoticeHref("not-open"));
    case "redirect":
      redirect(started.url);
    case "razorpay":
      redirect(chargePayPath(started.charge.id));
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled charge payment start: ${JSON.stringify(unhandled)}`);
    }
  }
}
