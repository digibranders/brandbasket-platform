import { recordEmail, type Database, type ScopedTransaction } from "@brandbasket/db";
import { escapeHtml, type EmailMessage, type EmailOutboxCopy } from "./message";

/**
 * What became of a message handed to a transport. `sent`: Brevo took it. `queued`: Brevo did not, and the drainer will try again.
 * `failed`: it will not go (Brevo refused it, or its body is redacted so it cannot be tried again). `local_only`: kept in the
 * development inbox. `suppressed`: optional mail to an address that opted out or bounced, so nothing was sent or stored.
 */
export interface EmailSendOutcome {
  readonly status: "sent" | "queued" | "failed" | "local_only" | "suppressed";
  readonly error?: string | null;
}

/**
 * A transport never throws for a delivery failure (an email must not fail the request that triggered it, least of all a
 * payment webhook); it answers with the outcome. An older or simpler transport may answer nothing, which means sent.
 */
export interface EmailTransport {
  readonly send: (message: EmailMessage) => Promise<EmailSendOutcome | void>;
}

/** The outcome of a send, with a transport that answered nothing counted as sent. */
export function emailOutcome(answer: EmailSendOutcome | void): EmailSendOutcome {
  return answer ?? { status: "sent" };
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

/** The stored text of a message with attachments says which files went out; the bytes are never stored. */
function withAttachmentNames(stored: { readonly subject: string; readonly bodyText: string; readonly bodyHtml: string }, message: EmailMessage): { readonly subject: string; readonly bodyText: string; readonly bodyHtml: string } {
  if (message.attachments === undefined || message.attachments.length === 0) return stored;
  const names = message.attachments.map((file) => file.name).join(", ");
  return { subject: stored.subject, bodyText: `${stored.bodyText}\nAttachments: ${names}`, bodyHtml: `${stored.bodyHtml}\n<p>Attachments: ${escapeHtml(names)}</p>` };
}

/** What became of a message: sent by Brevo (with Brevo's id), kept locally, or not taken by Brevo (with the reason). */
export interface EmailDeliveryResult {
  readonly status: "sent" | "local_only" | "failed" | "pending";
  readonly providerMessageId?: string | null;
  readonly error?: string | null;
  /** For `pending`: when the drainer may try again. */
  readonly nextAttemptAt?: Date;
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
  const text = withAttachmentNames(stored, message);
  await recordEmail(db, {
    toAddress: message.to,
    subject: text.subject,
    template: message.template,
    bodyText: text.bodyText,
    bodyHtml: text.bodyHtml,
    transport,
    status: result.status,
    providerMessageId: result.providerMessageId ?? null,
    error: result.error ?? null,
    bodyRedacted: stored !== message,
    ...(result.status === "pending" ? { attempts: 1, nextAttemptAt: result.nextAttemptAt ?? new Date() } : {}),
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
      return { status: "local_only" };
    },
  };
}
