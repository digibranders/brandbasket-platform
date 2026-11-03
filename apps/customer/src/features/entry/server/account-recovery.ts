import "server-only";
import { isInvalidTokenError } from "@brandbasket/auth";
import { consumeRateLimit, findUserByPhone, isPhoneAccountEmail, phoneAccountEmail, type RateLimitRule } from "@brandbasket/db";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { headers } from "next/headers";
import { generatePasswordResetEmail, getAuth } from "@/lib/auth";
import type { AccountIdentifier } from "./customer-sign-in-form";
import { realDeployment } from "@/features/server-common/email";
import { createEmailDelivery, createOutboxTransport } from "@brandbasket/email";
import { after } from "next/server";
import { getAppDb, getPublicDb } from "@/lib/db";
import { BRAND } from "../rules/brand";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";

/*
 * Getting back into an account: a one-time link to choose a new password. It runs for people who are not signed in,
 * so every entry is rate limited, and nothing here ever says whether an address or a mobile number has an account.
 */

const ONE_HOUR_SECONDS = 60 * 60;
/** Per network: enough for a household or an office behind one address. */
const RESET_REQUESTS_PER_CLIENT: RateLimitRule = { limit: 6, windowSeconds: ONE_HOUR_SECONDS };
/** Per address, from anywhere: so a stranger cannot fill someone's inbox with reset emails. Also per mobile number. */
const RESET_REQUESTS_PER_EMAIL: RateLimitRule = { limit: 3, windowSeconds: ONE_HOUR_SECONDS };
/** Per network: tries at a reset link. The token is 24 random characters, so this only bounds the noise. */
const RESET_ATTEMPTS_PER_CLIENT: RateLimitRule = { limit: 10, windowSeconds: ONE_HOUR_SECONDS };
/** Looked up in place of a mobile number with no usable account: no account has it, so the request takes the same path as any other. */
const NO_ACCOUNT_EMAIL = "no-account@phone.brandbasket.invalid";

async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

export type ResetRequestOutcome = "accepted" | "limited" | "failed";

/** A successful neutral outbox probe must leave no message for an address without an account. */
class ResetMailProbeComplete extends Error {}

/**
 * Emails a reset link to the account `identifier` names, at the email address on file, if there is one. "accepted"
 * says nothing about whether there is: the caller shows the same message either way. The identifier comes from
 * parseAccountIdentifier, so an email is already normalised and a number is E.164.
 */
export async function requestPasswordReset(identifier: AccountIdentifier): Promise<ResetRequestOutcome> {
  const db = getAppDb();
  const perClient = await consumeRateLimit(db, `password-reset:client:${await clientIp()}`, RESET_REQUESTS_PER_CLIENT);
  if (!perClient.allowed) return "limited";

  // An account opened with a mobile number alone has only a placeholder address: there is nobody to write to.
  if (identifier.kind === "email" && isPhoneAccountEmail(identifier.email)) return "accepted";
  // A number with no account takes every step an account's does, with an address nobody holds in its place.
  const onFile = identifier.kind === "phone" ? await findUserByPhone(db, identifier.phone) : null;
  const deliverable = onFile !== null && !isPhoneAccountEmail(onFile.email) ? onFile.email : null;
  const email = identifier.kind === "email" ? identifier.email : (deliverable ?? NO_ACCOUNT_EMAIL);

  // Over a per-address or per-number budget is answered like any other request: saying "limited" here would confirm
  // nothing about the address, but it would tell a stranger their flood is landing. A number is also held to the
  // account's address budget, so an account cannot be flooded by alternating between the two.
  const budgets =
    identifier.kind === "email"
      ? [`password-reset:email:${identifier.email}`]
      : [`password-reset:phone:${identifier.phone}`, `password-reset:email:${deliverable ?? phoneAccountEmail(identifier.phone)}`];
  for (const key of budgets) {
    if (!(await consumeRateLimit(db, key, RESET_REQUESTS_PER_EMAIL)).allowed) return "accepted";
  }

  try {
    const message = await generatePasswordResetEmail(email);
    // Every address takes the same outbox write, redacted on a real deployment. An unavailable outbox must not reveal
    // which addresses have accounts by failing only the requests with real mail. The neutral probe is always rolled back.
    try {
      await getPublicDb().transaction(async (tx) => {
        await createOutboxTransport(tx, { keepLinksForLocalDevelopment: !realDeployment() }).send(message ?? {
          to: email, subject: `Reset your ${BRAND.name} password`, template: "password-reset",
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
