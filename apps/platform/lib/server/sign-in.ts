import "server-only";
import { isInvalidCredentialsError } from "@firstfold/auth";
import { findUserByPhone, phoneAccountEmail } from "@firstfold/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@firstfold/shared/lib/client-ip";
import type { SignInFormState } from "@firstfold/shared/lib/sign-in-form";
import { retryMessage } from "@firstfold/shared/lib/sign-in-limits";
import { parseCustomerSignInForm } from "./customer-sign-in-form";
import { requestBrand } from "./request-brand";
import { getAppDb } from "./db";
import { signInCustomer } from "./signed-in-hint";
import { firstBlockedSignInLimit } from "@firstfold/shared/server/rate-limits";
import { noteSecurityEvent } from "./security-events";

/** `userId` is the account that signed in, for the caller that decides where it lands: its session cookie is not readable yet in the same request. */
export type SignInOutcome = SignInFormState | { readonly status: "signed-in"; readonly userId: string };

/**
 * Signs a customer in with their password and either the mobile number a free listing account was opened with or the
 * email a website client's account was made for. Better Auth signs in by email, so a number is first turned into its
 * account's address: the one stored for it, or, for a number with no account, the placeholder it would have had, so
 * a password is checked (and fails) either way and nothing tells a stranger which numbers have accounts.
 */
export async function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  // A brand whose accounts are opened with an email asks for one; the number sign-in still works for an account that has one.
  const parsed = parseCustomerSignInForm(formData, (await requestBrand()).signUpWith === "email" ? "email" : "phone-or-email");
  if (!parsed.success) return { status: "error", message: parsed.message, email: parsed.typed };

  const { identifier, password } = parsed.data;
  // What the form echoes back: exactly what was typed, not the address a number stands for.
  const typed = String(formData.get("identifier") ?? "").trim();
  const requestHeaders = await headers();

  // One budget per account, keyed by what it signs in with.
  const accountKey = identifier.kind === "phone" ? identifier.phone : identifier.email;
  const blocked = await firstBlockedSignInLimit(getAppDb(), accountKey, clientIpFrom(requestHeaders));
  if (blocked !== null) {
    // Not awaited: the person is told at once; the count and any alert happen beside it.
    void noteSecurityEvent("sign_in_blocked");
    return { status: "error", message: retryMessage(blocked.retryAfterSeconds), email: typed };
  }

  const email =
    identifier.kind === "email"
      ? identifier.email
      : ((await findUserByPhone(getAppDb(), identifier.phone))?.email ?? phoneAccountEmail(identifier.phone));
  let userId: string;
  try {
    ({ userId } = await signInCustomer({ email, password }, requestHeaders));
  } catch (error) {
    // Only a genuine credentials failure is shown as such; any other auth fault surfaces as a real error.
    if (isInvalidCredentialsError(error)) {
      const what = identifier.kind === "phone" ? "number" : "email";
      return { status: "error", message: `That ${what} and password don’t match an account.`, email: typed };
    }
    throw error;
  }
  return { status: "signed-in", userId };
}
