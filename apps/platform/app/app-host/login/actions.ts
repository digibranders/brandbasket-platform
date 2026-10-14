"use server";

import { otpLimitMessage } from "@/lib/auth-retry";
import { redirect } from "next/navigation";
import { typedSignInIdentifier, type SignInFormState } from "@fynix/shared/lib/sign-in-form";
import { offersChoice } from "@/lib/brand";
import { parseJoinForm, type JoinCodeStep, type JoinFormState } from "@/lib/join-form";
import { membershipPathFor, membershipTierForChoice } from "@/lib/membership";
import { LISTING_ACCOUNT_HOME, LISTING_PAGE_PATH } from "@/lib/server/customer-access";
import { createListingAccount, requestJoinCode } from "@/lib/server/listing-account";
import { landingForSignedInUser } from "@/lib/server/affiliate-access";
import { requestBrand } from "@/lib/server/request-brand";
import { signInWithPassword } from "@/lib/server/sign-in";
import { checkHuman } from "@fynix/shared/server/turnstile-request";

export async function signInCustomer(_previous: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const human = await checkHuman(formData, "sign_in");
  if (!human.ok) return { status: "error", message: human.message, email: typedSignInIdentifier(formData) };
  const outcome = await signInWithPassword(formData);
  // An affiliate with no business has no customer dashboard: they land on their own page.
  if (outcome.status === "signed-in") redirect(await landingForSignedInUser(outcome.userId));
  return outcome;
}

/**
 * Creating an account on the entry page, sent twice by the same form. First with no code: we text one to the owner's
 * number (under Fynix, email one to their address) and the form moves to its code step. Then with the code: the account is opened and the owner is in. "Send a
 * new code" is the first send again.
 *
 * Where they land depends on what they chose (docs/superpowers/specs/2026-09-30-single-entry-premium-design.md,
 * 2026-10-07-care-plan-design.md): an owner who chose Care or Premium goes to that plan's payment page, which holds
 * them until they pay; a claim goes on to advertising; a business that is not in the directory yet is added first.
 */
export async function joinForListing(previous: JoinFormState, formData: FormData): Promise<JoinFormState> {
  // Where the form was: on its code step (a code is out) or still on the details.
  const current: JoinCodeStep | null = previous.status === "idle" ? null : previous.otp;
  const human = await checkHuman(formData, "join");
  if (!human.ok) return { status: "error", message: human.message, otp: current };
  const resend = formData.get("resend") === "1";
  if (resend) {
    formData.delete("otpId");
    formData.delete("code");
  }

  // What the form asks for depends on the brand the host is sold under: a mobile number (Fynix) or an email address (Fynix).
  const brand = await requestBrand();
  const parsed = parseJoinForm(formData, brand.signUpWith);
  if (!parsed.success) {
    const onCodeStep = formData.get("otpId") !== null && formData.get("otpId") !== "";
    return { status: "error", message: parsed.message, otp: onCodeStep ? current : null };
  }
  // The form only offers what the host sells, but a form is whatever it is sent: Fynix sells Care and Premium, for a new
  // business (no claim), and a post for the free listing is refused here as it would be on the plans page.
  if (!offersChoice(brand, parsed.data.choice) || (!brand.showsListing && parsed.data.kind === "claim")) {
    const onCodeStep = formData.get("otpId") !== null && formData.get("otpId") !== "";
    return { status: "error", message: "Choose a plan to continue.", otp: onCodeStep ? current : null };
  }

  if (parsed.data.code === null) {
    const outcome = await requestJoinCode(parsed.data);
    if (outcome.kind === "code") return { status: "code", otp: outcome.otp };
    if (outcome.kind === "limited") return {
      status: "error", message: otpLimitMessage(outcome, "send"), otp: resend ? current : null,
      retry: { operation: "send", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds },
    };
    // A new code that could not be sent leaves the owner where they were, with the old one still usable.
    return { status: "error", message: outcome.message, otp: resend ? current : null };
  }

  const outcome = await createListingAccount(parsed.data);
  if (outcome.kind === "limited") return {
    status: "error", message: otpLimitMessage(outcome, "confirm"), otp: current,
    retry: { operation: "confirm", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds },
  };
  if (outcome.kind === "wrong-code") return { status: "error", message: outcome.message, otp: current };
  if (outcome.kind === "refused") return { status: "error", message: outcome.message, otp: null };
  const paid = membershipTierForChoice(parsed.data.choice);
  if (paid !== null) redirect(membershipPathFor(paid));
  redirect(parsed.data.kind === "claim" ? LISTING_ACCOUNT_HOME : LISTING_PAGE_PATH);
}
