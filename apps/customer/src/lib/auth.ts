import "server-only";
import { createAuth, PASSWORD_RESET_LIFETIME_SECONDS, type Auth, type AuthMailer } from "@brandbasket/auth";
import { passwordResetEmail, type EmailMessage } from "@brandbasket/email";
import { resetPasswordPath } from "@/features/entry/rules/account-recovery-form";
import { customerEmailTransport } from "@/features/server-common/email";
import { getAppDb, getPublicDb } from "./db";
import { serverEnv } from "./env";

// Module-scoped, not on globalThis: a hot reload re-evaluates this module and picks up configuration changes.
let auth: Auth | undefined;

/** The reset email for one token, linking to this app's own reset page. */
function resetMessage(email: string, token: string): EmailMessage {
  return passwordResetEmail({
    to: email,
    resetUrl: new URL(resetPasswordPath(token), serverEnv().APP_ORIGIN).toString(),
    expiresInMinutes: PASSWORD_RESET_LIFETIME_SECONDS / 60,
  });
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

function configuredAuth(mailer: AuthMailer, nextCookies: boolean): Auth {
  const env = serverEnv();
  return createAuth({ db: getAppDb(), secret: env.BETTER_AUTH_SECRET, baseURL: env.APP_ORIGIN, trustedOrigins: [env.APP_ORIGIN], nextCookies, mailer });
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
