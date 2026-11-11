import "server-only";
import { isWrongPasswordError } from "@brandbasket/auth";
import { consumeRateLimit, type RateLimitRule } from "@brandbasket/db";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getAppDb } from "@/lib/db";
import { reportError } from "@/lib/report";

/*
 * Ported from apps/platform lib/server/account-security.ts. Changing the password, deleting the account and the password
 * check all draw on ONE guess budget (`change-password:user:<id>`, 8 an hour), kept on purpose: typos while deleting can lock out
 * changing the password, and a stolen session cannot guess the password it is protecting.
 */

/** A stolen session must not be able to guess the password it is protecting. Generous for a real typo. */
const PASSWORD_ATTEMPTS_PER_USER: RateLimitRule = { limit: 8, windowSeconds: 60 * 60 };

/** The shared guess budget's key. Exported so the tests can prove delete and change share it. */
export const passwordBudgetKey = (userId: string): string => `change-password:user:${userId}`;

export type ChangePasswordOutcome = "changed" | "changed-revoke-failed" | "wrong-password" | "limited";

/**
 * Changes the signed-in user's password. The current one must be right, and every other device is signed out with the
 * change: someone who changes their password because they fear it is known wants that. The session making the change
 * stays signed in, unchanged. A revocation failure returns partial success so credentials are never replayed.
 * Never throws for a wrong password or a spent budget.
 */
export async function changePasswordFor(
  userId: string,
  input: { readonly currentPassword: string; readonly newPassword: string },
): Promise<ChangePasswordOutcome> {
  const budget = await consumeRateLimit(getAppDb(), passwordBudgetKey(userId), PASSWORD_ATTEMPTS_PER_USER);
  if (!budget.allowed) return "limited";
  const requestHeaders = await headers();
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
      headers: requestHeaders,
    });
  } catch (error) {
    if (isWrongPasswordError(error)) return "wrong-password";
    throw error;
  }
  return (await revokeOtherSessions(requestHeaders)) ? "changed" : "changed-revoke-failed";
}

/** Uses Better Auth's revoke-only operation so the current session cookie remains valid. */
async function revokeOtherSessions(requestHeaders: Headers): Promise<boolean> {
  try {
    await getAuth().api.revokeOtherSessions({ headers: requestHeaders });
    return true;
  } catch (error) {
    reportError(error, { area: "settings.revoke-other-sessions" });
    return false;
  }
}

/** A retry after a partial password-change success, and the Sign out other devices button. No password is accepted or changed. */
export async function revokeOtherSessionsFor(userId: string): Promise<"revoked" | "limited" | "failed"> {
  const budget = await consumeRateLimit(getAppDb(), `revoke-other-sessions:user:${userId}`, PASSWORD_ATTEMPTS_PER_USER);
  if (!budget.allowed) return "limited";
  return (await revokeOtherSessions(await headers())) ? "revoked" : "failed";
}

/**
 * True when `password` is the signed-in user's. For a step that must be sure it is the account's owner at the keyboard
 * and not whoever left a session open: it shares the password-guessing budget with changing the password. Returns
 * "limited" rather than a verdict once the budget is spent.
 */
export async function checkPasswordFor(userId: string, password: string): Promise<"correct" | "wrong-password" | "limited"> {
  const budget = await consumeRateLimit(getAppDb(), passwordBudgetKey(userId), PASSWORD_ATTEMPTS_PER_USER);
  if (!budget.allowed) return "limited";
  try {
    await getAuth().api.verifyPassword({ body: { password }, headers: await headers() });
    return "correct";
  } catch (error) {
    if (isWrongPasswordError(error)) return "wrong-password";
    throw error;
  }
}
