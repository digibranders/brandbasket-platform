import { recordEmail, type Database, type ScopedTransaction } from "@brandbasket/db";
import type { EmailMessage, EmailOutboxCopy } from "./message";

export interface EmailTransport {
  readonly send: (message: EmailMessage) => Promise<void>;
}

export const OUTBOX_TRANSPORT_NAME = "outbox";

export interface OutboxOptions {
  /**
   * Local development only, where the outbox is the inbox: store the full message for an email whose copy withholds a
   * sign-in link (EmailOutboxCopy.linkWithheld), so a developer can open the link. Any other redaction still applies.
   */
  readonly keepLinksForLocalDevelopment?: boolean;
}

function storedMessage(message: EmailMessage, options: OutboxOptions): EmailMessage | EmailOutboxCopy {
  if (options.keepLinksForLocalDevelopment === true && message.outboxCopy?.linkWithheld === true) return message;
  return message.outboxCopy ?? message;
}

/** What became of a message: sent by Brevo (with Brevo's id), kept locally, or not taken by Brevo (with the reason). */
export interface EmailDeliveryResult {
  readonly status: "sent" | "local_only" | "failed";
  readonly providerMessageId?: string | null;
  readonly error?: string | null;
}

const KEPT_LOCALLY: EmailDeliveryResult = { status: "local_only" };

/** Writes the outbox row for a message, using its redacted copy when it has one, and what became of it. */
export async function recordOutboxCopy(
  db: Database | ScopedTransaction,
  message: EmailMessage,
  transport: string,
  options: OutboxOptions = {},
  result: EmailDeliveryResult = KEPT_LOCALLY,
): Promise<void> {
  const stored = storedMessage(message, options);
  await recordEmail(db, {
    toAddress: message.to,
    subject: stored.subject,
    template: message.template,
    bodyText: stored.bodyText,
    bodyHtml: stored.bodyHtml,
    transport,
    status: result.status,
    providerMessageId: result.providerMessageId ?? null,
    error: result.error ?? null,
    bodyRedacted: stored !== message,
  });
}

/**
 * Records the message instead of sending it. Staff read it in the admin Outbox. On a real deployment the app sends
 * through Brevo instead (createAppEmailTransport); this transport alone is the local development inbox.
 */
export function createOutboxTransport(db: Database | ScopedTransaction, options: OutboxOptions = {}): EmailTransport {
  return {
    send: async (message) => {
      await recordOutboxCopy(db, message, OUTBOX_TRANSPORT_NAME, options);
    },
  };
}
