import { claimDueEmails, isEmailSuppressed, updateEmailDelivery, type Database, type StoredEmail } from "@brandbasket/db";
import { emailFailureSummary, isRetryableEmailError, nextEmailAttemptAt, type BrevoTransport } from "./brevo";
import { isOptionalEmail } from "./optional-mail";

export interface EmailDrainReport {
  /** Queued messages that were due and taken this run. */
  readonly claimed: number;
  readonly sent: number;
  /** Tried again and failed in a way that may pass: back in the queue for a later run. */
  readonly requeued: number;
  /** Out of attempts, refused by Brevo, or not sendable: now `failed` (shown on Today and Deliveries). */
  readonly failed: number;
  /** Optional mail to an address that opted out or bounced since it was queued: closed as `bounced`, not sent. */
  readonly suppressed: number;
}

const DEFAULT_LIMIT = 50;
/** A claimed message is not offered to another run for this long; a run that dies midway leaves it to be picked up after. */
const LEASE_MS = 10 * 60 * 1000;

/**
 * Sends the queued (`pending`) emails that are due. Each one is tried with the attempts it has left (`max_attempts`, 3 by
 * default, the first made inline when it was queued): a retryable failure goes back in the queue with backoff, and the last
 * failure, or one Brevo will not take, ends the row as `failed`. Never throws for one message's failure.
 */
export async function drainEmailQueue(
  db: Database,
  brevo: BrevoTransport,
  now: Date,
  options: { readonly limit?: number } = {},
): Promise<EmailDrainReport> {
  const due = await claimDueEmails(db, now, { limit: options.limit ?? DEFAULT_LIMIT, leaseMs: LEASE_MS });
  let sent = 0;
  let requeued = 0;
  let failed = 0;
  let suppressed = 0;

  for (const email of due) {
    const outcome = await attempt(db, brevo, email, now);
    if (outcome === "sent") sent += 1;
    else if (outcome === "requeued") requeued += 1;
    else if (outcome === "suppressed") suppressed += 1;
    else failed += 1;
  }
  return { claimed: due.length, sent, requeued, failed, suppressed };
}

async function attempt(db: Database, brevo: BrevoTransport, email: StoredEmail, now: Date): Promise<"sent" | "requeued" | "failed" | "suppressed"> {
  if (email.bodyRedacted) {
    await updateEmailDelivery(db, email.id, { status: "failed", providerMessageId: null, error: "The stored copy is redacted and cannot be sent again", now });
    return "failed";
  }
  try {
    if (isOptionalEmail(email.template) && (await isEmailSuppressed(db, email.toAddress))) {
      await updateEmailDelivery(db, email.id, { status: "bounced", providerMessageId: null, error: "Not sent: the address is suppressed", now });
      return "suppressed";
    }
    // Attachment bytes are never stored, so a retry sends the stored text alone (the stored copy names the files that were lost).
    const receipt = await brevo.send({ to: email.toAddress, subject: email.subject, template: email.template, bodyText: email.bodyText, bodyHtml: email.bodyHtml });
    await updateEmailDelivery(db, email.id, { status: "sent", providerMessageId: receipt.providerMessageId, error: null, now });
    return "sent";
  } catch (error) {
    const summary = emailFailureSummary(error);
    const attemptsMade = email.attempts + 1;
    if (attemptsMade < email.maxAttempts && isRetryableEmailError(error)) {
      await updateEmailDelivery(db, email.id, { status: "pending", providerMessageId: null, error: summary, now, nextAttemptAt: nextEmailAttemptAt(now, attemptsMade) });
      return "requeued";
    }
    await updateEmailDelivery(db, email.id, { status: "failed", providerMessageId: null, error: summary, now });
    return "failed";
  }
}
