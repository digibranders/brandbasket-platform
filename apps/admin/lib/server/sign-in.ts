import "server-only";
import { isInvalidCredentialsError } from "@firstfold/auth";
import { findActiveStaffMember, findActiveStaffUserIdByEmail, isPhoneAccountEmail } from "@firstfold/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@firstfold/shared/lib/client-ip";
import { parseSignInForm, type SignInFormState } from "@firstfold/shared/lib/sign-in-form";
import { retryMessage } from "@firstfold/shared/lib/sign-in-limits";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { firstBlockedSignInLimit } from "@firstfold/shared/server/rate-limits";
import { logStaffAccess } from "./staff-access-log";

export type SignInOutcome = SignInFormState | { readonly status: "signed-in" };

/**
 * Records a staff member's sign-in, or a wrong password against a staff account, in the access log (DPDP Rules 2025
 * r.6(1)(c)). A customer who signs in here gets no access and is not recorded. A fault in the lookup or the log never
 * changes the outcome of the sign-in: it is logged and the sign-in goes on.
 */
async function recordStaffSignIn(outcome: { readonly userId: string } | { readonly email: string }): Promise<void> {
  try {
    if ("userId" in outcome) {
      if ((await findActiveStaffMember(getStaffDb(), outcome.userId)) === null) return;
      await logStaffAccess({ staffUserId: outcome.userId, action: "staff.sign_in", result: "ok" });
      return;
    }
    const staffUserId = await findActiveStaffUserIdByEmail(getStaffDb(), outcome.email);
    if (staffUserId === null) return;
    await logStaffAccess({ staffUserId, action: "staff.sign_in", result: "failed" });
  } catch (error) {
    console.error("A staff sign-in could not be recorded.", errorLogInfo(error));
  }
}

export async function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  const parsed = parseSignInForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, email: parsed.email };

  const { email, password } = parsed.data;
  // A free listing owner's placeholder address (an account opened with a mobile number) is no staff sign-in, and
  // checking a password against it here would give that account a second guessing budget.
  if (isPhoneAccountEmail(email)) {
    return { status: "error", message: "That email and password don’t match an account.", email };
  }
  const requestHeaders = await headers();

  const blocked = await firstBlockedSignInLimit(getStaffDb(), email, clientIpFrom(requestHeaders));
  if (blocked !== null) {
    return { status: "error", message: retryMessage(blocked.retryAfterSeconds), email };
  }

  let signedIn: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["signInEmail"]>>;
  try {
    signedIn = await getAuth().api.signInEmail({ body: { email, password }, headers: requestHeaders });
  } catch (error) {
    // Only a genuine credentials failure is shown as such; any other auth fault surfaces as a real error.
    if (isInvalidCredentialsError(error)) {
      await recordStaffSignIn({ email });
      return { status: "error", message: "That email and password don’t match an account.", email };
    }
    throw error;
  }
  await recordStaffSignIn({ userId: signedIn.user.id });
  return { status: "signed-in" };
}
