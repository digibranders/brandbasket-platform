import "server-only";
import { isInvalidCredentialsError } from "@brandbasket/auth";
import { findUserByPhone, phoneAccountEmail } from "@brandbasket/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import type { SignInFormState } from "@brandbasket/shared/lib/sign-in-form";
import { retryMessage } from "@brandbasket/shared/lib/sign-in-limits";
import { parseCustomerSignInForm } from "./customer-sign-in-form";
import { getAppDb } from "@/lib/db";
import { signInCustomer } from "./customer-sign-in";
import { firstBlockedSignInLimit } from "@brandbasket/shared/server/rate-limits";
import { noteSecurityEvent } from "./security-events";

/** `userId` is the account that signed in, for the caller that decides where it lands: its session cookie is not readable yet in the same request. */
export type SignInOutcome = SignInFormState | { readonly status: "signed-in"; readonly userId: string };

/**
 * Signs a customer in with their password and either the email the account was made with or the mobile number given at
 * sign-up. Better Auth signs in by email, so a number is first turned into its account's address, or, for a number with
 * no account, the placeholder it would have had: a password is checked (and fails) either way, so nothing tells a
 * stranger which numbers have accounts.
 */
export async function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  const parsed = parseCustomerSignInForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, email: parsed.typed };

  const { identifier, password } = parsed.data;
  // What the form echoes back: exactly what was typed, not the address a number stands for.
  const typed = String(formData.get("identifier") ?? "").trim();
  const requestHeaders = await headers();

  const email =
    identifier.kind === "email"
      ? identifier.email
      : ((await findUserByPhone(getAppDb(), identifier.phone))?.email ?? phoneAccountEmail(identifier.phone));

  // One budget per account, keyed by its address, so an account's number and its email share it instead of each
  // getting a fresh one. A number with no account is keyed by its placeholder.
  const blocked = await firstBlockedSignInLimit(getAppDb(), email, clientIpFrom(requestHeaders));
  if (blocked !== null) {
    // Not awaited: the person is told at once; the count and any alert happen beside it.
    void noteSecurityEvent("sign_in_blocked");
    return { status: "error", message: retryMessage(blocked.retryAfterSeconds), email: typed };
  }

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
