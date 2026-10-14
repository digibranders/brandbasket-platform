"use server";


import { AccountAlreadyExistsError } from "@fynix/auth";
import { redirect } from "next/navigation";
import { AFFILIATE_PATH } from "@fynix/shared/lib/affiliate-links";
import { checkHuman } from "@fynix/shared/server/turnstile-request";
import { parseSetupForm, SETUP_AGREE_MESSAGE, type SetupFormState } from "@/lib/setup-form";
import { AffiliateAccountTakenError, redeemAffiliateLogin } from "@/lib/server/affiliate-setup";
import { InviteNotUsableError, TermsNotAgreedError, TooManySetupAttemptsError } from "@/lib/server/setup";

export async function completeAffiliateSetup(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return { status: "error", message: "This link is incomplete. Open the link you were sent again." };
  }

  const mode = formData.get("mode") === "verify-existing" ? "verify-existing" as const : undefined;
  const human = await checkHuman(formData, "affiliate_setup");
  if (!human.ok) return { status: "error", message: human.message, mode };
  const parsed = parseSetupForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field, mode };

  let signedIn: boolean;
  try {
    ({ signedIn } = await redeemAffiliateLogin(token, parsed.data));
  } catch (error) {
    // The tick is checked where the account is made, since an affiliate choosing a new password needs none.
    if (error instanceof TermsNotAgreedError) return { status: "error", message: SETUP_AGREE_MESSAGE, field: "agree", mode };
    if (error instanceof InviteNotUsableError) {
      return { status: "error", message: "This link no longer works. Ask us for a new one." };
    }
    // The error carries how long is left on the budget, so they are told when to come back.
    if (error instanceof TooManySetupAttemptsError) return { status: "error", message: error.message, mode };
    // A duplicate creation attempt or failed ownership check needs the existing account’s current password.
    if (error instanceof AccountAlreadyExistsError) {
      return {
        status: "error",
        mode: "verify-existing",
        field: "password",
        message: "This email already has a Fynix account. Enter that account’s password to link it, or ask us to use another email.",
      };
    }
    if (error instanceof AffiliateAccountTakenError) {
      return { status: "error", message: "This email is already linked to another affiliate. Ask us to use another email." };
    }
    throw error;
  }
  redirect(signedIn ? AFFILIATE_PATH : "/login?notice=password-changed");
}
