import "server-only";
import { createAuth, PASSWORD_RESET_LIFETIME_SECONDS, type Auth, type AuthMailer } from "@brandbasket/auth";
import { isPasswordPending } from "@brandbasket/db";
import { passwordResetEmail, type EmailMessage } from "@brandbasket/email";
import { resetPasswordPath } from "@/features/entry/rules/account-recovery-form";
import { customerEmailTransport } from "@/features/server-common/email";
import { getAppDb, getPublicDb } from "./db";
import { serverEnv } from "./env";

// Module-scoped, not on globalThis: a hot reload re-evaluates this module and picks up configuration changes.
let auth: Auth | undefined;

/** How long the link in a new customer's payment email works (plan 64, D9): they may open the email days later. */
export const SET_PASSWORD_LIFETIME_SECONDS = 3 * 24 * 60 * 60;

/** The address of this app's own reset page for one token. */
function resetUrl(token: string): string {
  return new URL(resetPasswordPath(token), serverEnv().APP_ORIGIN).toString();
}

/** The reset email for one token, linking to this app's own reset page. */
function resetMessage(email: string, token: string): EmailMessage {
  return passwordResetEmail({ to: email, resetUrl: resetUrl(token), expiresInMinutes: PASSWORD_RESET_LIFETIME_SECONDS / 60 });
}

/**
 * The account emails, written through the intake connection, which may only add outbox messages: they are sent on behalf
 * of someone who is not signed in. Ported from apps/platform lib/server/auth.ts. This app serves one host, so the link is
 * built on APP_ORIGIN.
 */
function accountMailer(): AuthMailer {
  return {
    sendPasswordReset: async ({ email, token }) => {
      await customerEmailTransport(getPublicDb()).send(resetMessage(email, token));
    },
  };
}

function configuredAuth(mailer: AuthMailer, nextCookies: boolean, resetPasswordLifetimeSeconds?: number): Auth {
  const env = serverEnv();
  return createAuth({
    db: getAppDb(),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    trustedOrigins: [env.APP_ORIGIN],
    nextCookies,
    mailer,
    ...(resetPasswordLifetimeSeconds === undefined ? {} : { resetPasswordLifetimeSeconds }),
  });
}

/**
 * This app's Better Auth instance over the row-level-security connection. Cookies are host-only (no cross-subdomain
 * cookies, docs/STAFF-ACCESS.md), so a session belongs to the host that set it. No Better Auth HTTP route is served: sign
 * in, sign up, reset and sign out run as server actions (src/features/entry), as in the old app.
 */
export function getAuth(): Auth {
  auth ??= configuredAuth(accountMailer(), true);
  return auth;
}

/**
 * Makes the library's real reset token and the email that carries it, without writing mail yet. The capture belongs to
 * this call, so simultaneous requests never share recipients or tokens. Creates no session or cookie. Null when the
 * address has no account.
 */
export async function generatePasswordResetEmail(email: string): Promise<EmailMessage | null> {
  const captured: { message: EmailMessage | null } = { message: null };
  const resetAuth = configuredAuth(
    {
      sendPasswordReset: async ({ email: recipient, token }) => {
        captured.message = resetMessage(recipient, token);
      },
    },
    false,
  );
  await resetAuth.api.requestPasswordReset({ body: { email } });
  return captured.message;
}

/**
 * A real reset link for a new customer to set their first password from (plan 64, D3), good for 3 days. Null unless the
 * account exists and is still waiting for its owner's first password, so a returning customer's payment email never carries
 * one. Sends nothing and creates no session: the caller puts the link in the email it is writing.
 */
export async function generateSetPasswordUrl(email: string): Promise<string | null> {
  if (!(await isPasswordPending(getAppDb(), email))) return null;
  const captured: { url: string | null } = { url: null };
  const setAuth = configuredAuth(
    {
      sendPasswordReset: async ({ token }) => {
        captured.url = resetUrl(token);
      },
    },
    false,
    SET_PASSWORD_LIFETIME_SECONDS,
  );
  await setAuth.api.requestPasswordReset({ body: { email } });
  return captured.url;
}
