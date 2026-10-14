import { accounts, sessions, users, verifications, type Database } from "@fynix/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hasAccountCreationGrant } from "./account-creation-grant";

export const PASSWORD_MIN_LENGTH = 10;
/** How long a customer stays signed in. The staff console asks for a shorter one (STAFF_SESSION_LIFETIME_SECONDS). */
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
/**
 * How long a staff member stays signed in: one working day, then they sign in again. A stolen staff cookie is worth
 * a day, not a week (DPDP Rules 2025 r.6(1)(b)). Sessions here are read where cookies cannot be written, so they do
 * not refresh while in use and an idle timeout is not possible yet.
 */
export const STAFF_SESSION_LIFETIME_SECONDS = 60 * 60 * 12;
/** How long a password reset link works. Short: it is as good as the password until it is used. */
export const PASSWORD_RESET_LIFETIME_SECONDS = 60 * 60;
/** How long an email confirmation link works. Long enough for an owner who reads their email the next day. */
export const EMAIL_CONFIRMATION_LIFETIME_SECONDS = 60 * 60 * 24 * 3;

/** One account email to write: who it is for, and the one-time token its link must carry. */
export interface AccountMail {
  readonly email: string;
  readonly name: string;
  readonly token: string;
}

/**
 * Writes the account emails. The auth package knows when one is due and with which token; the app knows its own
 * addresses and how email leaves it, so it builds the link and sends the message.
 */
export interface AuthMailer {
  readonly sendPasswordReset: (mail: AccountMail) => Promise<void>;
  readonly sendEmailConfirmation: (mail: AccountMail) => Promise<void>;
}
const MIN_SECRET_LENGTH = 32;

export interface AuthConfig {
  readonly db: Database;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  /** Server actions need this to write session cookies. Scripts and tests run outside Next.js and must leave it off. */
  readonly nextCookies: boolean;
  /**
   * Turns on password reset and email confirmation. Left out by scripts, tests and the staff console, which send
   * neither: asking for a reset there is then refused instead of silently sending nothing.
   */
  readonly mailer?: AuthMailer;
  /** How long a session lasts, in seconds. Left out, a week: the customer default. The staff console passes a shorter one. */
  readonly sessionLifetimeSeconds?: number;
}

export function createAuth(config: AuthConfig) {
  // An empty or short secret silently falls back to Better Auth's own env-var lookup or a public default
  // (see context/create-context.mjs), which would make every session forgeable. Fail loudly instead.
  if (config.secret.length < MIN_SECRET_LENGTH) {
    throw new Error("The auth secret must be at least 32 characters.");
  }
  // BETTER_AUTH_SECRETS, if set, overrides the secret we were configured with. Refuse to start rather
  // than silently sign with a different secret than the one the caller intended.
  if (process.env.BETTER_AUTH_SECRETS !== undefined) {
    throw new Error("BETTER_AUTH_SECRETS is set and would override the configured auth secret. Unset it.");
  }

  const sessionLifetimeSeconds = config.sessionLifetimeSeconds ?? SESSION_LIFETIME_SECONDS;
  if (!Number.isInteger(sessionLifetimeSeconds) || sessionLifetimeSeconds < 1) {
    throw new Error(`The session lifetime must be a positive whole number of seconds, received ${sessionLifetimeSeconds}.`);
  }

  const { mailer } = config;
  return betterAuth({
    // Better Auth names the product in anything it prints itself (this app sends its own emails, so rarely): the deployment's brand.
    appName: "Fynix Digital",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [...config.trustedOrigins],
    database: drizzleAdapter(config.db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      autoSignIn: false,
      // A reset is how someone locked out, or someone who fears their password is known, gets back in: every other
      // session of the account ends with it.
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_LIFETIME_SECONDS,
      ...(mailer === undefined
        ? {}
        : {
            sendResetPassword: ({ user, token }: { user: { email: string; name: string }; token: string }) =>
              mailer.sendPasswordReset({ email: user.email, name: user.name, token }),
          }),
    },
    ...(mailer === undefined
      ? {}
      : {
          emailVerification: {
            // Sent when the app asks (a free listing sign-up), not on every sign-up: a client's account is made from
            // the setup link sent to its address, which already proves it.
            sendOnSignUp: false,
            expiresIn: EMAIL_CONFIRMATION_LIFETIME_SECONDS,
            sendVerificationEmail: ({ user, token }: { user: { email: string; name: string }; token: string }) =>
              mailer.sendEmailConfirmation({ email: user.email, name: user.name, token }),
          },
        }),
    user: {
      // A free listing owner's number (packages/db schema/auth.ts). Set only by createPhoneAccountWithGrant: this
      // app serves none of Better Auth's own HTTP routes, so no request body ever reaches these fields.
      additionalFields: {
        phoneNumber: { type: "string", required: false },
        phoneNumberVerified: { type: "boolean", required: false, defaultValue: false },
      },
    },
    session: {
      expiresIn: sessionLifetimeSeconds,
    },
    // IDs: Better Auth's default text IDs. Do not set advanced.database.generateId to "uuid": on the pg
    // provider that defers ID generation to the database, and these text id columns have no default.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Refuse by returning false. Never throw a 403 here: Better Auth turns a 403 from this
            // hook into a fake success response (see dist/api/routes/sign-up.mjs).
            if (!hasAccountCreationGrant(user.email)) return false;
            return;
          },
        },
      },
    },
    plugins: config.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
