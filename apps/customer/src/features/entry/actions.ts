"use server";

import { AccountAlreadyExistsError } from "@brandbasket/auth";
import { InviteNoLongerRedeemableError } from "@brandbasket/db";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actionFail, type ActionFailure, type ActionResult, type ActionSuccess } from "@/lib/action-result";
import { getAuth } from "@/lib/auth";
import { startHref } from "@/features/start/rules";
import { parseResetPasswordForm } from "./rules/account-recovery-form";
import { inviteReturn, NEXT_FIELD, SIGN_IN_PATH } from "./rules/account-entry";
import { otpLimitMessage, type OtpRetry } from "./rules/auth-retry";
import { offersChoice } from "./rules/brand";
import { parseJoinForm, type JoinCodeStep } from "./rules/join-form";
import { attributionFromStart } from "./rules/start-attribution";
import { parseSetupForm, SETUP_AGREE_MESSAGE, type SetupField } from "./rules/setup-form";
import { requestPasswordReset, resetPassword } from "./server/account-recovery";
import { parseAccountIdentifier } from "./server/customer-sign-in-form";
import { landingForSignedInUser } from "./server/entry-access";
import { leadsApiToken } from "./server/env";
import { createListingAccount, requestJoinCode } from "./server/listing-account";
import { InviteNotUsableError, redeemSetupInvite, TermsNotAgreedError, TooManySetupAttemptsError } from "./server/setup";
import { signInWithPassword } from "./server/sign-in";

/*
 * The entry screens' actions. They are public: nobody is signed in yet, so instead of a guard each one runs the robot check
 * (Turnstile) first and the rate limits of its server module. Ported from apps/platform app/app-host/{login,
 * forgot-password,reset-password,setup}/actions.ts and lib/server/sign-out.ts. Each validates its form with the zod parsers
 * in ./rules and returns an ActionResult; a few carry one more fact on a failure, named on their result type.
 */

/** Sign in with an email or mobile number and a password. On success the person is sent where they belong. */
export async function signInAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const human = await checkHuman(formData, "sign_in");
  if (!human.ok) return actionFail(human.message);
  const outcome = await signInWithPassword(formData);
  // An affiliate with no business has no customer workspace: they land on their own page.
  // An invitation the person came from sign-in for comes first; any other `next` is ignored.
  if (outcome.status === "signed-in") redirect(inviteReturn(formData.get(NEXT_FIELD)) ?? (await landingForSignedInUser(outcome.userId)));
  if (outcome.status === "error") return actionFail(outcome.message);
  return actionFail("Check your details and try again.");
}

/**
 * Where the sign-up form is after a send: on the code step (`otp`), or on the details (`otp` null). A refused limit also
 * says how long to wait, so the form can hold its buttons back.
 */
export type SignUpFailure = ActionFailure & { readonly otp: JoinCodeStep | null; readonly retry?: OtpRetry };
export type SignUpResult = { readonly ok: true; readonly data: { readonly otp: JoinCodeStep } } | SignUpFailure;

/**
 * Creating an account, sent twice by the same form. First with no code: we email one to the owner's address and the form
 * moves to its code step. Then with the code: the account is opened, the owner is signed in and goes to the short
 * questions before checkout, on the services the link chose. "Send a new code" is the first send again.
 */
export async function signUpAction(previous: SignUpResult | null, formData: FormData): Promise<SignUpResult> {
  const current: JoinCodeStep | null = previous === null ? null : previous.ok ? previous.data.otp : previous.otp;
  const fail = (message: string, otp: JoinCodeStep | null, retry?: OtpRetry): SignUpFailure =>
    retry === undefined ? { ...actionFail(message), otp } : { ...actionFail(message), otp, retry };
  const human = await checkHuman(formData, "join");
  if (!human.ok) return fail(human.message, current);
  const resend = formData.get("resend") === "1";
  if (resend) {
    formData.delete("otpId");
    formData.delete("code");
  }
  const onCodeStep = typeof formData.get("otpId") === "string" && formData.get("otpId") !== "";

  const parsed = parseJoinForm(formData);
  if (!parsed.success) return fail(parsed.message, onCodeStep ? current : null);
  // The form only offers Managed Website, but a form is whatever it is sent: anything else is refused here.
  if (!offersChoice(parsed.data.choice)) return fail("Choose a plan to continue.", onCodeStep ? current : null);

  if (parsed.data.code === null) {
    const outcome = await requestJoinCode(parsed.data);
    if (outcome.kind === "code") return { ok: true, data: { otp: outcome.otp } };
    if (outcome.kind === "limited") {
      return fail(otpLimitMessage(outcome, "send"), resend ? current : null, { operation: "send", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds });
    }
    // A new code that could not be sent leaves the owner where they were, with the old one still usable.
    return fail(outcome.message, resend ? current : null);
  }

  const nextReturn = inviteReturn(formData.get(NEXT_FIELD));
  const inviteToken = nextReturn !== null ? nextReturn.slice("/invite/".length) : null;
  const outcome = await createListingAccount(parsed.data, attributionFromStart(formData, leadsApiToken()), { inviteToken });
  if (outcome.kind === "limited") {
    return fail(otpLimitMessage(outcome, "confirm"), current, { operation: "confirm", scope: outcome.scope, retryAfterSeconds: outcome.retryAfterSeconds });
  }
  if (outcome.kind === "wrong-code") return fail(outcome.message, current);
  if (outcome.kind === "refused") return fail(outcome.message, null);
  // The basket rides along so checkout opens on those services; only catalogue ids survive.
  redirect(nextReturn ?? startHref(readBundleSelection(String(formData.get("services") ?? "").split(","))));
}

/** What the forgot-password form says once it is sent, whether or not there is an account. */
export interface ResetLinkSent {
  readonly kind: "email" | "phone";
  /** The address (normalised) or the number (as typed) that was asked about. */
  readonly typed: string;
}

/**
 * /forgot-password. An email address or a mobile number is answered with a one-time link to choose a new password, emailed
 * to the address on the account; the answer is the same whether or not there is an account.
 */
export async function requestPasswordResetAction(_previous: ActionResult<ResetLinkSent> | null, formData: FormData): Promise<ActionResult<ResetLinkSent>> {
  const human = await checkHuman(formData, "forgot_password");
  if (!human.ok) return actionFail(human.message);
  const entered = formData.get("identifier");
  const typed = typeof entered === "string" ? entered.trim() : "";
  const parsed = parseAccountIdentifier(typed);
  if (!parsed.success) return actionFail(parsed.message);

  const { identifier } = parsed;
  const outcome = await requestPasswordReset(identifier);
  if (outcome === "limited") return actionFail("Too many requests from this network. Try again in an hour.");
  if (outcome === "failed") return actionFail("We couldn't process email delivery right now. Please try again in a moment.");
  return { ok: true, data: identifier.kind === "email" ? { kind: "email", typed: identifier.email } : { kind: "phone", typed } };
}

/** `deadLink`: the link is used up, expired or never existed, and the form is replaced by the way to ask for a new one. */
export type ResetPasswordResult = ActionSuccess<never> | (ActionFailure & { readonly deadLink?: true });

/** Sets the new password for a reset link's account. Every session of the account ends, so they sign in again. */
export async function resetPasswordAction(_previous: ResetPasswordResult | null, formData: FormData): Promise<ResetPasswordResult> {
  const human = await checkHuman(formData, "reset_password");
  if (!human.ok) return actionFail(human.message);
  const parsed = parseResetPasswordForm(formData);
  if (!parsed.success) return actionFail(parsed.message);

  const outcome = await resetPassword(parsed.token, parsed.password);
  if (outcome === "dead-link") return { ...actionFail("This link no longer works. Reset links work once and expire after an hour."), deadLink: true };
  if (outcome === "limited") return actionFail("Too many tries from this network. Try again in an hour.");
  redirect(`${SIGN_IN_PATH}?notice=password-changed`);
}

/** `mode`: the address already has an account, so the form asks for its password instead. `field`: where to put focus. */
export type SetupResult = ActionSuccess<never> | (ActionFailure & { readonly mode?: "verify-existing"; readonly field?: SetupField });

/** Redeems a staff setup link: creates the account and business, or links an existing account, then signs the owner in. */
export async function completeSetupAction(_previous: SetupResult | null, formData: FormData): Promise<SetupResult> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") return actionFail("This setup link is incomplete. Open the link from your email again.");
  const mode = formData.get("mode") === "verify-existing" ? ("verify-existing" as const) : undefined;
  const fail = (message: string, field?: SetupField, nextMode = mode): SetupResult => ({
    ...actionFail(message),
    ...(nextMode === undefined ? {} : { mode: nextMode }),
    ...(field === undefined ? {} : { field }),
  });

  const human = await checkHuman(formData, "setup");
  if (!human.ok) return fail(human.message);
  const parsed = parseSetupForm(formData);
  if (!parsed.success) return fail(parsed.message, parsed.field);

  try {
    await redeemSetupInvite(token, parsed.data);
  } catch (error) {
    if (error instanceof TermsNotAgreedError) return fail(SETUP_AGREE_MESSAGE, "agree");
    // Both mean the invite can no longer be redeemed; the second is the transaction's own gate when two submissions race.
    if (error instanceof InviteNotUsableError || error instanceof InviteNoLongerRedeemableError) {
      return actionFail("This setup link no longer works. Ask us for a new one.");
    }
    if (error instanceof TooManySetupAttemptsError) return fail(error.message);
    if (error instanceof AccountAlreadyExistsError) {
      return fail("This email already has a Brandbasket account. Enter that account’s password to finish setup.", "password", "verify-existing");
    }
    throw error;
  }
  redirect("/");
}

/** Ends this device's session and goes to sign in. Needs no guard: signing out someone who is not signed in does nothing. */
export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect(SIGN_IN_PATH);
}
