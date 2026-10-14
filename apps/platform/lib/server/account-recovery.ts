import "server-only";
import { isAuthApiError, isInvalidTokenError } from "@fynix/auth";
import { consumeRateLimit, isPhoneAccountEmail, type RateLimitRule } from "@fynix/db";
import { clientIpFrom } from "@fynix/shared/lib/client-ip";
import { headers } from "next/headers";
import { generatePasswordResetEmail, getAuth } from "./auth";
import { getAppDb } from "./db";
import { realDeployment } from "./email";
import { createEmailDelivery, createOutboxTransport } from "@fynix/email";
import { after } from "next/server";
import { getPublicDb } from "./public-db";
import { currentBrand } from "./request-brand";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/*
 * Getting back into an account (a one-time link to choose a new password) and proving an email address is its
 * owner's (a link that confirms it). Both run for people who are not signed in, so every entry is rate limited, and
 * nothing here ever says whether an address has an account.
 */

const ONE_HOUR_SECONDS = 60 * 60;
/** Per network: enough for a household or an office behind one address. */
const RESET_REQUESTS_PER_CLIENT: RateLimitRule = { limit: 6, windowSeconds: ONE_HOUR_SECONDS };
/** Per address, from anywhere: so a stranger cannot fill someone's inbox with reset emails. */
const RESET_REQUESTS_PER_EMAIL: RateLimitRule = { limit: 3, windowSeconds: ONE_HOUR_SECONDS };
/** Per network: tries at a reset link. The token is 24 random characters, so this only bounds the noise. */
const RESET_ATTEMPTS_PER_CLIENT: RateLimitRule = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
/** Per network: opening a confirmation link, which a mail scanner may do before the owner does. */
const CONFIRM_ATTEMPTS_PER_CLIENT: RateLimitRule = { limit: 30, windowSeconds: ONE_HOUR_SECONDS };
/** Per address: asking for the confirmation email again. */
const CONFIRM_RESENDS_PER_EMAIL: RateLimitRule = { limit: 3, windowSeconds: ONE_HOUR_SECONDS };

async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export type ResetRequestOutcome = "accepted" | "limited" | "failed";

/** A successful neutral outbox probe must leave no message for an address without an account. */
class ResetMailProbeComplete extends Error {}

/**
 * Emails a reset link to `email` if it has an account. "accepted" says nothing about whether it does: the caller
 * shows the same message either way. `email` must already be normalised (trimmed, lowercase).
 */
export async function requestPasswordReset(email: string): Promise<ResetRequestOutcome> {
  const db = getAppDb();
  const perClient = await consumeRateLimit(db, `password-reset:client:${await clientIp()}`, RESET_REQUESTS_PER_CLIENT);
  if (!perClient.allowed) return "limited";
  // Over the per-address budget is answered like any other request: saying "limited" here would confirm nothing
  // about the address, but it would tell a stranger their flood is landing.
  const perEmail = await consumeRateLimit(db, `password-reset:email:${email}`, RESET_REQUESTS_PER_EMAIL);
  if (!perEmail.allowed) return "accepted";

  // An account opened with a mobile number has only a placeholder address: there is nobody to write to.
  if (isPhoneAccountEmail(email)) return "accepted";

  try {
    const message = await generatePasswordResetEmail(email);
    // Every address takes the same outbox write, redacted on a real deployment. An unavailable outbox must not reveal
    // which addresses have accounts by failing only the requests with real mail. The neutral probe is always rolled back.
    try {
      await getPublicDb().transaction(async (tx) => {
        await createOutboxTransport(tx, { keepLinksForLocalDevelopment: !realDeployment() }).send(message ?? {
          to: email, subject: `Reset your ${(await currentBrand()).name} password`, template: "password-reset",
          bodyText: "Password reset delivery check.", bodyHtml: "<p>Password reset delivery check.</p>",
        });
        if (message === null) throw new ResetMailProbeComplete();
      });
    } catch (error) {
      if (!(error instanceof ResetMailProbeComplete)) throw error;
    }
    // Delivery runs after the response, so how long the reply takes says nothing about whether the address has an account.
    const delivery = message === null ? null : createEmailDelivery();
    if (message !== null && delivery !== null) {
      after(async () => {
        try {
          await delivery.send(message);
        } catch (error) {
          console.error("A password reset email could not be delivered.", errorLogInfo(error));
        }
      });
    }
  } catch (error) {
    // The caller retains their input and can retry; this outcome says nothing about account existence.
    console.error("A password reset email could not be sent.", errorLogInfo(error));
    return "failed";
  }
  return "accepted";
}

export type PasswordResetOutcome = "changed" | "dead-link" | "limited";

/** Sets the new password for the account the reset link belongs to, and signs every device out of it. */
export async function resetPassword(token: string, newPassword: string): Promise<PasswordResetOutcome> {
  const budget = await consumeRateLimit(getAppDb(), `password-reset-use:client:${await clientIp()}`, RESET_ATTEMPTS_PER_CLIENT);
  if (!budget.allowed) return "limited";
  try {
    await getAuth().api.resetPassword({ body: { token, newPassword } });
    return "changed";
  } catch (error) {
    if (isInvalidTokenError(error)) return "dead-link";
    throw error;
  }
}

export type EmailConfirmationOutcome =
  | { readonly kind: "confirmed" | "dead-link" | "failed" }
  | { readonly kind: "limited"; readonly retryAfterSeconds: number };

/**
 * Marks the address in a confirmation link as its owner's. Opening the link twice, or after the address is already
 * confirmed, is "confirmed" again. Temporary limits and faults retain the same-token retry path.
 */
export async function confirmEmail(token: string): Promise<EmailConfirmationOutcome> {
  const budget = await consumeRateLimit(getAppDb(), `confirm-email:client:${await clientIp()}`, CONFIRM_ATTEMPTS_PER_CLIENT);
  if (!budget.allowed) return { kind: "limited", retryAfterSeconds: budget.retryAfterSeconds };
  try {
    await getAuth().api.verifyEmail({ query: { token } });
    return { kind: "confirmed" };
  } catch (error) {
    // A token that is not one, has expired, or names an address with no account: all the same to the person.
    if (isInvalidTokenError(error) || (isAuthApiError(error) && error.body?.code === "USER_NOT_FOUND")) return { kind: "dead-link" };
    console.error("An email confirmation could not be completed.", errorLogInfo(error));
    return { kind: "failed" };
  }
}

export type ConfirmationSendOutcome = "sent" | "limited" | "failed";

/**
 * Emails the confirmation link to `email`, which the caller has established is the address of an account that has
 * not confirmed it (a sign-up just made, or the signed-in customer). A failure is logged and reported, never thrown:
 * the account exists either way and the dashboard offers to send the link again.
 */
export async function sendEmailConfirmation(email: string): Promise<ConfirmationSendOutcome> {
  // A placeholder address (an account opened with a mobile number) has nothing to confirm and nobody to write to.
  if (isPhoneAccountEmail(email)) return "failed";
  try {
    const budget = await consumeRateLimit(getAppDb(), `confirm-email-send:email:${email}`, CONFIRM_RESENDS_PER_EMAIL);
    if (!budget.allowed) return "limited";
    await getAuth().api.sendVerificationEmail({ body: { email } });
    return "sent";
  } catch (error) {
    console.error("An email confirmation link could not be sent.", errorLogInfo(error));
    return "failed";
  }
}
