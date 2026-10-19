"use server";


import { AccountAlreadyExistsError } from "@brandbasket/auth";
import { InviteNoLongerRedeemableError } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { parseSetupForm, SETUP_AGREE_MESSAGE, type SetupFormState } from "@/lib/setup-form";
import { InviteNotUsableError, redeemSetupInvite, TermsNotAgreedError, TooManySetupAttemptsError } from "@/lib/server/setup";

export async function completeSetup(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return { status: "error", message: "This setup link is incomplete. Open the link from your email again." };
  }

  const mode = formData.get("mode") === "verify-existing" ? "verify-existing" as const : undefined;
  const human = await checkHuman(formData, "setup");
  if (!human.ok) return { status: "error", message: human.message, mode };
  const parsed = parseSetupForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field, mode };

  try {
    await redeemSetupInvite(token, parsed.data);
  } catch (error) {
    // The tick is checked where the account is made, since an affiliate choosing a new password needs none.
    if (error instanceof TermsNotAgreedError) return { status: "error", message: SETUP_AGREE_MESSAGE, field: "agree", mode };
    // Both mean the same thing to the customer: the invite can no longer be redeemed. InviteNoLongerRedeemableError
    // is thrown by the database transaction's own gate, so two submissions of the same link racing each other
    // (two tabs, a double click) both land here rather than one of them creating a second business.
    if (error instanceof InviteNotUsableError || error instanceof InviteNoLongerRedeemableError) {
      return { status: "error", message: "This setup link no longer works. Ask us for a new one." };
    }
    // The error carries how long is left on the budget, so the customer is told when to come back.
    if (error instanceof TooManySetupAttemptsError) {
      return { status: "error", message: error.message, mode };
    }
    // Both a duplicate creation attempt and a failed ownership check lead to the same explicit verification step.
    if (error instanceof AccountAlreadyExistsError) {
      return { status: "error", message: "This email already has a Fynix account. Enter that account’s password to finish setup.", mode: "verify-existing", field: "password" };
    }
    throw error;
  }
  redirect("/");
}
