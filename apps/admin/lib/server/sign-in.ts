import "server-only";
import {
  issueStaffSignInCode,
  STAFF_SIGN_IN_CODE_TTL_SECONDS,
  verifyCredentials,
  verifyStaffSignInCode,
  withdrawStaffSignInCode,
} from "@brandbasket/auth";
import { findActiveStaffMember, findActiveStaffUserIdByEmail, findUserByEmail, isPhoneAccountEmail } from "@brandbasket/db";
import { staffSignInCodeEmail } from "@brandbasket/email";
import { headers } from "next/headers";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { parseSignInForm } from "@brandbasket/shared/lib/sign-in-form";
import { retryMessage } from "@brandbasket/shared/lib/sign-in-limits";
import { CODE_EXPIRED_MESSAGE, parseStaffCodeForm, wrongCodeMessage, type StaffSignInFormState } from "@/lib/staff-sign-in-form";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";
import { customerEmailTransport, emailCodeBypassed } from "./email";
import { serverEnv } from "./env";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { firstBlockedSignInLimit } from "@brandbasket/shared/server/rate-limits";
import { logStaffAccess } from "./staff-access-log";

export type SignInOutcome = StaffSignInFormState;
export type CodeOutcome =
  | { readonly status: "signed-in" }
  | { readonly status: "error"; readonly message: string; readonly restart: boolean };

const NO_MATCH = "That email and password don’t match an account.";
const NOT_SENT = "We couldn’t send the code. Try again in a minute.";

/**
 * Records a staff member's sign-in, or a failed step of one, in the access log (DPDP Rules 2025 r.6(1)(c)). A customer who
 * signs in here gets no access and is not recorded. A fault in the lookup or the log never changes the outcome of the
 * sign-in: it is logged and the sign-in goes on.
 */
async function recordStaffSignIn(outcome: { readonly userId: string } | { readonly email: string; readonly detail: string }): Promise<void> {
  try {
    if ("userId" in outcome) {
      if ((await findActiveStaffMember(getStaffDb(), outcome.userId)) === null) return;
      await logStaffAccess({ staffUserId: outcome.userId, action: "staff.sign_in", result: "ok" });
      return;
    }
    const staffUserId = await findActiveStaffUserIdByEmail(getStaffDb(), outcome.email);
    if (staffUserId === null) return;
    await logStaffAccess({ staffUserId, action: "staff.sign_in", result: "failed", detail: outcome.detail });
  } catch (error) {
    console.error("A staff sign-in could not be recorded.", errorLogInfo(error));
  }
}

/**
 * Step one: the password. A right password starts no session; it emails a code and hands back the id of that code, and the
 * session is made only when the code is entered (`finishSignIn`). A wrong password, an unknown address and an
 * address with no password all answer the same.
 */
export async function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  const parsed = parseSignInForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, email: parsed.email };

  const { email, password } = parsed.data;
  // A free listing owner's placeholder address (an account opened with a mobile number) is no staff sign-in, and
  // checking a password against it here would give that account a second guessing budget.
  if (isPhoneAccountEmail(email)) return { status: "error", message: NO_MATCH, email };
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);

  const blocked = await firstBlockedSignInLimit(getStaffDb(), email, clientIp);
  if (blocked !== null) return { status: "error", message: retryMessage(blocked.retryAfterSeconds), email };

  const credentials = await verifyCredentials(getAuth(), email, password);
  if (credentials === null) {
    await recordStaffSignIn({ email, detail: "wrong password" });
    return { status: "error", message: NO_MATCH, email };
  }

  const db = getStaffDb();
  const issued = await issueStaffSignInCode(db, {
    email: credentials.email,
    clientIp,
    secret: serverEnv().BETTER_AUTH_SECRET,
    now: new Date(),
  });
  if (issued.kind === "limited") return { status: "error", message: retryMessage(issued.retryAfterSeconds), email };

  if (emailCodeBypassed()) console.warn("The email code bypass is on: any 6-digit code finishes a console sign-in. The code is in the outbox.");
  try {
    await customerEmailTransport(db).send(
      staffSignInCodeEmail({ to: credentials.email, code: issued.code, expiresInMinutes: STAFF_SIGN_IN_CODE_TTL_SECONDS / 60 }),
    );
  } catch (error) {
    // A code nobody received is no use to anyone: use it up so it cannot be guessed at.
    console.error("A staff sign-in code could not be emailed.", errorLogInfo(error));
    await withdrawStaffSignInCode(db, issued.otpId);
    return { status: "error", message: NOT_SENT, email };
  }
  return { status: "code", email, otpId: issued.otpId };
}

/**
 * Step two: the emailed code. Only a right code, used for the first time, starts the session (marked as having passed it,
 * which the console requires). Wrong and used-up codes of a staff account are logged as failed sign-ins.
 */
export async function finishSignIn(formData: FormData): Promise<CodeOutcome> {
  const { otpId, code } = parseStaffCodeForm(formData);
  const requestHeaders = await headers();
  const db = getStaffDb();

  const checked = await verifyStaffSignInCode(db, {
    otpId,
    code,
    clientIp: clientIpFrom(requestHeaders),
    secret: serverEnv().BETTER_AUTH_SECRET,
    now: new Date(),
    acceptAnySixDigits: emailCodeBypassed(),
  });

  switch (checked.kind) {
    case "limited":
      return { status: "error", message: retryMessage(checked.retryAfterSeconds), restart: false };
    case "wrong_code":
      if (checked.email !== null) await recordStaffSignIn({ email: checked.email, detail: "wrong code" });
      return { status: "error", message: wrongCodeMessage(checked.triesLeft), restart: false };
    case "expired":
      if (checked.email !== null) await recordStaffSignIn({ email: checked.email, detail: "code tries used up" });
      return { status: "error", message: CODE_EXPIRED_MESSAGE, restart: true };
    case "verified": {
      const user = await findUserByEmail(db, checked.email);
      if (user === null) return { status: "error", message: CODE_EXPIRED_MESSAGE, restart: true };
      await getAuth().api.completeStaffSignIn({ body: { userId: user.id }, headers: requestHeaders });
      await recordStaffSignIn({ userId: user.id });
      return { status: "signed-in" };
    }
  }
}
