"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import { AccountAlreadyExistsError } from "@brandbasket/auth";
import { AFFILIATE_PATH } from "@brandbasket/shared/lib/affiliate-links";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { redirect } from "next/navigation";
import { InviteNotUsableError, TermsNotAgreedError, TooManySetupAttemptsError } from "@/features/entry/server/setup";
import { parseSetupForm, SETUP_AGREE_MESSAGE, type SetupField } from "@/features/entry/rules/setup-form";
import { actionFail, type ActionFailure, type ActionSuccess } from "@/lib/action-result";
import { AffiliateAccountTakenError, redeemAffiliateLogin } from "./server/setup";

/** `mode`: the address already has an account, so the form asks for its password instead. `field`: where to put focus. */
export type AffiliateSetupResult = ActionSuccess<never> | (ActionFailure & { readonly mode?: "verify-existing"; readonly field?: SetupField });

/**
 * Opens an affiliate's account from the one-use link the console emailed: a new password, a link to an account the address
 * already has, or a new account. Public like the other setup links: instead of a guard it runs the robot check first and the
 * rate limits of the setup server module, and the link's token is the only input that names anything.
 * Ported from apps/platform app/app-host/affiliate/setup/[token]/actions.ts.
 */
export async function completeAffiliateSetupAction(_previous: AffiliateSetupResult | null, formData: FormData): Promise<AffiliateSetupResult> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") return actionFail("This link is incomplete. Open the link you were sent again.");
  const mode = formData.get("mode") === "verify-existing" ? ("verify-existing" as const) : undefined;
  const fail = (message: string, field?: SetupField, nextMode = mode): AffiliateSetupResult => ({
    ...actionFail(message),
    ...(nextMode === undefined ? {} : { mode: nextMode }),
    ...(field === undefined ? {} : { field }),
  });

  const human = await checkHuman(formData, "affiliate_setup");
  if (!human.ok) return fail(human.message);
  const parsed = parseSetupForm(formData);
  if (!parsed.success) return fail(parsed.message, parsed.field);

  let signedIn: boolean;
  try {
    ({ signedIn } = await redeemAffiliateLogin(token, parsed.data));
  } catch (error) {
    // The tick is checked where the account is made, since an affiliate choosing a new password needs none.
    if (error instanceof TermsNotAgreedError) return fail(SETUP_AGREE_MESSAGE, "agree");
    if (error instanceof InviteNotUsableError) return actionFail("This link no longer works. Ask us for a new one.");
    // The error carries how long is left on the budget, so they are told when to come back.
    if (error instanceof TooManySetupAttemptsError) return fail(error.message);
    // A duplicate creation attempt or failed ownership check needs the existing account's current password.
    if (error instanceof AccountAlreadyExistsError) {
      return fail("This email already has a Brandbasket account. Enter that account’s password to link it, or ask us to use another email.", "password", "verify-existing");
    }
    if (error instanceof AffiliateAccountTakenError) return actionFail("This email is already linked to another affiliate. Ask us to use another email.");
    throw error;
  }
  redirect(signedIn ? AFFILIATE_PATH : "/login?notice=password-changed");
}
