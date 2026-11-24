import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { emailMessages, emailSuppressions, type EmailStatus, type EmailSuppressionReason } from "../schema";
import type { DeliveryListFilter } from "./deliveries";
import { containsPattern } from "./like";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordedEmail {
  readonly toAddress: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly transport: string;
  /** Left out by older writers: a "brevo" row is then sent, any other row local only. */
  readonly status?: EmailStatus;
  readonly providerMessageId?: string | null;
  readonly error?: string | null;
  readonly bodyRedacted?: boolean;
  /** Attempts already made (the schema default of 1 when left out); a queued row is written after its first try. */
  readonly attempts?: number;
  /** When the drainer may try a `pending` row again; required for that status. */
  readonly nextAttemptAt?: Date | null;
}

export interface StoredEmail {
  readonly id: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly transport: string;
  readonly status: EmailStatus;
  readonly providerMessageId: string | null;
  readonly error: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastAttemptAt: Date;
  readonly bodyRedacted: boolean;
  readonly createdAt: Date;
}

const EMAIL_COLUMNS = {
  id: emailMessages.id,
  toAddress: emailMessages.toAddress,
  subject: emailMessages.subject,
  template: emailMessages.template,
  bodyText: emailMessages.bodyText,
  bodyHtml: emailMessages.bodyHtml,
  transport: emailMessages.transport,
  status: emailMessages.status,
  providerMessageId: emailMessages.providerMessageId,
  error: emailMessages.error,
  attempts: emailMessages.attempts,
  maxAttempts: emailMessages.maxAttempts,
  nextAttemptAt: emailMessages.nextAttemptAt,
  lastAttemptAt: emailMessages.lastAttemptAt,
  bodyRedacted: emailMessages.bodyRedacted,
  createdAt: emailMessages.createdAt,
} as const;

export async function recordEmail(db: Database | ScopedTransaction, email: RecordedEmail): Promise<void> {
  const { attempts, nextAttemptAt, ...stored } = email;
  await db.insert(emailMessages).values({
    ...stored,
    status: email.status ?? (email.transport === "brevo" ? "sent" : "local_only"),
    ...(attempts === undefined ? {} : { attempts }),
    nextAttemptAt: nextAttemptAt ?? null,
  });
}

/**
 * Whether an email of this template to this address, written at or after `since`, holds `text` in its body. The outbox has no key
 * of its own, so a sender that must not repeat itself (a receipt names its payment in its link) asks here before it sends. A
 * row counts whatever became of it except `failed`: a message that never went must not stop the receipt being sent again.
 */
export async function hasEmailContaining(
  db: Database,
  match: { readonly template: string; readonly toAddress: string; readonly text: string; readonly since: Date },
): Promise<boolean> {
  const rows = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.template, match.template),
        eq(emailMessages.toAddress, match.toAddress),
        ne(emailMessages.status, "failed"),
        gte(emailMessages.createdAt, match.since),
        ilike(emailMessages.bodyText, containsPattern(match.text)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Emails for the console's Deliveries page, newest first. */
export async function listEmailDeliveries(db: Database, filter: DeliveryListFilter): Promise<StoredEmail[]> {
  const conditions: SQL[] = [];
  if (filter.failedOnly) conditions.push(inArray(emailMessages.status, ["failed", "bounced"]));
  if (filter.search !== null) {
    const term = containsPattern(filter.search);
    const either = or(
      ilike(emailMessages.toAddress, term),
      ilike(emailMessages.subject, term),
      ilike(emailMessages.template, term),
      ...(UUID.test(filter.search) ? [eq(emailMessages.id, filter.search)] : []),
    );
    if (either !== undefined) conditions.push(either);
  }
  return db.select(EMAIL_COLUMNS).from(emailMessages).where(and(...conditions)).orderBy(desc(emailMessages.createdAt)).limit(filter.limit);
}

/**
 * Records another try at sending an email: its result, Brevo's id, the reason it failed, one more attempt. A `pending`
 * result needs `nextAttemptAt`; any other result clears it.
 */
export async function updateEmailDelivery(
  db: Database,
  id: string,
  attempt: {
    readonly status: EmailStatus;
    readonly providerMessageId: string | null;
    readonly error: string | null;
    readonly now: Date;
    readonly nextAttemptAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(emailMessages)
    .set({
      status: attempt.status,
      providerMessageId: attempt.providerMessageId,
      error: attempt.error,
      attempts: sql`${emailMessages.attempts} + 1`,
      nextAttemptAt: attempt.status === "pending" ? (attempt.nextAttemptAt ?? null) : null,
      lastAttemptAt: attempt.now,
    })
    .where(eq(emailMessages.id, id));
}

/**
 * Takes up to `limit` queued emails that are due, oldest first, and pushes each one's next attempt `leaseMs` ahead so a second
 * drainer (or a run that dies midway) does not send the same message twice. The caller records the real result with
 * updateEmailDelivery.
 */
export async function claimDueEmails(
  db: Database,
  now: Date,
  options: { readonly limit: number; readonly leaseMs: number },
): Promise<StoredEmail[]> {
  const lease = new Date(now.getTime() + options.leaseMs);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(and(eq(emailMessages.status, "pending"), lte(emailMessages.nextAttemptAt, now)))
      .orderBy(asc(emailMessages.nextAttemptAt))
      .limit(options.limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(emailMessages)
      .set({ nextAttemptAt: lease })
      .where(inArray(emailMessages.id, due.map((row) => row.id)))
      .returning(EMAIL_COLUMNS);
  });
}

/** Whether this address asked not to get optional mail, or bounced, or complained. Addresses are stored lower case. */
export async function isEmailSuppressed(db: Database, address: string): Promise<boolean> {
  const rows = await db
    .select({ address: emailSuppressions.address })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.address, address.trim().toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

/** Stops optional mail to this address. The first reason is kept: a repeated event changes nothing. */
export async function suppressEmailAddress(db: Database, address: string, reason: EmailSuppressionReason): Promise<void> {
  await db.insert(emailSuppressions).values({ address: address.trim().toLowerCase(), reason }).onConflictDoNothing();
}

/** Marks the message Brevo took as bounced, by Brevo's id (with or without its angle brackets). Returns how many rows changed. */
export async function markEmailBounced(db: Database, providerMessageId: string, reason: string): Promise<number> {
  const bare = providerMessageId.replace(/^<|>$/g, "");
  const updated = await db
    .update(emailMessages)
    .set({ status: "bounced", error: reason.slice(0, 300), nextAttemptAt: null })
    .where(and(inArray(emailMessages.providerMessageId, [bare, `<${bare}>`]), inArray(emailMessages.status, ["sent", "bounced"])))
    .returning({ id: emailMessages.id });
  return updated.length;
}

export async function listRecentEmails(db: Database, limit: number): Promise<StoredEmail[]> {
  return db.select(EMAIL_COLUMNS).from(emailMessages).orderBy(desc(emailMessages.createdAt)).limit(limit);
}

export async function findEmail(db: Database, id: string): Promise<StoredEmail | null> {
  const rows = await db.select(EMAIL_COLUMNS).from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Templates whose body carried a link that signs someone in. Their outbox rows go after a day. */
export const SIGN_IN_LINK_TEMPLATES = ["password-reset", "confirm-email", "setup-link", "staff-invite", "affiliate-link"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SIGN_IN_LINK_EMAIL_RETENTION_MS = DAY_MS;
export const OUTBOX_RETENTION_MS = 90 * DAY_MS;

/** Deletes outbox rows past their retention (docs/operations/retention-schedule.md). Returns how many went. */
export async function purgeOldEmailMessages(db: Database, now: Date): Promise<number> {
  const outboxCutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
  const linkCutoff = new Date(now.getTime() - SIGN_IN_LINK_EMAIL_RETENTION_MS);
  const deleted = await db
    .delete(emailMessages)
    .where(
      or(
        lt(emailMessages.createdAt, outboxCutoff),
        and(inArray(emailMessages.template, [...SIGN_IN_LINK_TEMPLATES]), lt(emailMessages.createdAt, linkCutoff)),
      ),
    )
    .returning({ id: emailMessages.id });
  return deleted.length;
}
