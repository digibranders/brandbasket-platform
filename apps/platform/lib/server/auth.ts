import "server-only";
import {
  createAuth,
  EMAIL_CONFIRMATION_LIFETIME_SECONDS,
  PASSWORD_RESET_LIFETIME_SECONDS,
  type Auth,
  type AuthConfig,
  type AuthMailer,
} from "@brandbasket/auth";
import { confirmEmailEmail, passwordResetEmail, type EmailMessage } from "@brandbasket/email";
import { confirmEmailPath, resetPasswordPath } from "@/lib/account-recovery-form";
import { getAppDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "@/lib/server/env";
import { getPublicDb } from "./public-db";
import { currentAppOrigin } from "./request-brand";

// Module-scoped rather than on globalThis (unlike the DB pools in ./db): a hot reload re-evaluates
// this module and picks up config changes, whereas globalThis would keep serving the stale instance.
let auth: Auth | undefined;

/**
 * The account emails, with links to this app's own pages (the auth library has no HTTP routes here). Written through
 * the intake connection, which may only add outbox messages: these are sent on behalf of someone who is not signed in.
 * The links point at the host the request came in on, so a Fynix owner's link opens on the Fynix host.
 */
function accountMailer(): AuthMailer {
  return {
    sendPasswordReset: async ({ email, token }) => {
      await customerEmailTransport(getPublicDb()).send(
        passwordResetEmail({
          to: email,
          resetUrl: new URL(resetPasswordPath(token), await currentAppOrigin()).toString(),
          expiresInMinutes: PASSWORD_RESET_LIFETIME_SECONDS / 60,
        }),
      );
    },
    sendEmailConfirmation: async ({ email, token }) => {
      await customerEmailTransport(getPublicDb()).send(
        confirmEmailEmail({
          to: email,
          confirmUrl: new URL(confirmEmailPath(token), await currentAppOrigin()).toString(),
          expiresInDays: EMAIL_CONFIRMATION_LIFETIME_SECONDS / (60 * 60 * 24),
        }),
      );
    },
  };
}

/** One source of configuration for the session auth and request-local reset generation. */
function configuredAuth(mailer: AuthMailer, nextCookies: boolean): Auth {
  const env = serverEnv();
  const config: AuthConfig = {
    db: getAppDb(), secret: env.BETTER_AUTH_SECRET, baseURL: env.APP_ORIGIN,
    trustedOrigins: [env.APP_ORIGIN, env.ADMIN_ORIGIN], nextCookies, mailer,
  };
  return createAuth(config);
}

/**
 * Generate the library's real reset token without writing mail yet. Capturing belongs to this request, so
 * simultaneous reset requests never share recipients or tokens. This API does not create a session or cookies.
 */
export async function generatePasswordResetEmail(email: string): Promise<EmailMessage | null> {
  const appOrigin = await currentAppOrigin();
  const captured: { message: EmailMessage | null } = { message: null };
  const resetAuth = configuredAuth({
    sendPasswordReset: async ({ email: recipient, token }) => {
      captured.message = passwordResetEmail({
        to: recipient, resetUrl: new URL(resetPasswordPath(token), appOrigin).toString(),
        expiresInMinutes: PASSWORD_RESET_LIFETIME_SECONDS / 60,
      });
    },
    sendEmailConfirmation: async () => {
      throw new Error("Email confirmation cannot run during reset token generation.");
    },
  }, false);
  await resetAuth.api.requestPasswordReset({ body: { email } });
  return captured.message;
}

export function getAuth(): Auth {
  auth ??= configuredAuth(accountMailer(), true);
  return auth;
}
