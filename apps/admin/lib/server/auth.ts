import "server-only";
import { createAuth, PASSWORD_RESET_LIFETIME_SECONDS, STAFF_SESSION_LIFETIME_SECONDS, type Auth } from "@brandbasket/auth";
import { passwordResetEmail, type EmailMessage } from "@brandbasket/email";
import { resetPasswordPath } from "@/lib/account-recovery-form";
import { getStaffDb } from "./db";
import { serverEnv } from "@/lib/server/env";

// Module-scoped rather than on globalThis (unlike the DB pools in ./db): a hot reload re-evaluates
// this module and picks up config changes, whereas globalThis would keep serving the stale instance.
let auth: Auth | undefined;

/** Capture a reset email per request; delivery belongs to the rate-limited recovery service. */
export async function generateStaffPasswordResetEmail(email: string): Promise<EmailMessage | null> {
  const env = serverEnv();
  const captured: { message: EmailMessage | null } = { message: null };
  const resetAuth = createAuth({
    db: getStaffDb(), secret: env.BETTER_AUTH_SECRET, baseURL: env.ADMIN_ORIGIN,
    trustedOrigins: [env.ADMIN_ORIGIN], nextCookies: false,
    sessionLifetimeSeconds: STAFF_SESSION_LIFETIME_SECONDS,
    mailer: {
      sendPasswordReset: async ({ email: recipient, token }) => {
        captured.message = passwordResetEmail({
          to: recipient,
          resetUrl: new URL(resetPasswordPath(token), env.ADMIN_ORIGIN).toString(),
          expiresInMinutes: PASSWORD_RESET_LIFETIME_SECONDS / 60,
        });
      },
      sendEmailConfirmation: async () => {
        throw new Error("Email confirmation is not available on the staff console.");
      },
    },
  });
  await resetAuth.api.requestPasswordReset({ body: { email } });
  return captured.message;
}

export function getAuth(): Auth {
  if (auth === undefined) {
    const env = serverEnv();
    auth = createAuth({
      db: getStaffDb(),
      secret: env.BETTER_AUTH_SECRET,
      // The console's own origin (https://console.brandbasket.in in production), a different host from the dashboard's: the session
      // cookie is host-only, so neither app ever receives the other's.
      baseURL: env.ADMIN_ORIGIN,
      trustedOrigins: [env.APP_ORIGIN, env.ADMIN_ORIGIN],
      nextCookies: true,
      sessionLifetimeSeconds: STAFF_SESSION_LIFETIME_SECONDS,
    });
  }
  return auth;
}
