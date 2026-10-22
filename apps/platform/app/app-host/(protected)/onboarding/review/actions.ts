"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { BillingRequiredError, requireBillingAccess } from "@/lib/server/billing";
import { startCheckoutFor } from "@/lib/server/checkout";
import { PAYMENT_STEP_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { submitOnboardingFor } from "@/lib/server/onboarding";
import { applyReferralCodeFor, removeReferralCodeFor } from "@/lib/server/referrals";
import { WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";

const PAYMENT_NEEDED = "Make your payment to send this to us. Use the Pay button on this page.";

/**
 * Pay and send: starts the first payment. Everything is checked again on the server in startCheckoutFor (the
 * checklist on stored data, the rate limit, and whether there is anything to pay), and nothing in the posted form is
 * read. On success the customer is sent to the provider's checkout; the payment's confirmation sends onboarding.
 */
export async function startCheckout(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const customer = await requireCustomerAccess();
  const outcome = await startCheckoutFor(customer, new Date());
  if (outcome.kind === "refused") return refusedStepState(outcome.problem, formData);
  redirect(outcome.url);
}

/**
 * Step 05 for a customer who has already paid: sends onboarding and starts the build. Refused without payment, on the
 * server, whatever the page showed; a paid client without the Managed Website service is sent Home. The checklist is
 * re-run from stored data inside submitOnboardingFor.
 */
export async function submitOnboarding(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const access = await requireBillingAccess().catch((error: unknown) => {
    if (error instanceof BillingRequiredError) return null;
    throw error;
  });
  if (access === null) return refusedStepState({ message: PAYMENT_NEEDED, field: null }, formData);
  // Onboarding is the website's: a paid client without the Managed Website service has nothing to send.
  if (!access.billing.hasWebsite) redirect("/");

  const problem = await submitOnboardingFor(getAppDb(), access.tenant, new Date());
  if (problem !== null) return refusedStepState(problem, formData);

  redirect("/project");
}

/**
 * Applies a referral code before payment. It is its own action, rather than a field on the Pay form, so the page can
 * re-render with the discounted price on the button: the amount shown and the amount charged then come from the
 * same server-side computation. Everything is checked again in applyReferralCodeFor, which never trusts the form.
 */
export async function applyReferralCode(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const customer = await requireCustomerAccess();
  const typed = formData.get("referralCode");
  // Check and send pays for the website alone (startCheckoutFor), so the code is priced against it.
  const outcome = await applyReferralCodeFor(customer, typeof typed === "string" ? typed : "", WEBSITE_ALONE, new Date());
  if (outcome.kind === "refused") return refusedStepState(outcome.problem, formData);
  revalidatePath(PAYMENT_STEP_HREF);
  return { status: "idle" };
}

/** Takes an applied code off again, before payment. */
export async function removeReferralCode(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const customer = await requireCustomerAccess();
  const outcome = await removeReferralCodeFor(customer);
  if (outcome.kind === "refused") return refusedStepState(outcome.problem, formData);
  revalidatePath(PAYMENT_STEP_HREF);
  return { status: "idle" };
}
