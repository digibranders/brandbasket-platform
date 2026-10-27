import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { emailMessages, type EmailStatus } from "../schema";
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
  lastAttemptAt: emailMessages.lastAttemptAt,
  bodyRedacted: emailMessages.bodyRedacted,
  createdAt: emailMessages.createdAt,
} as const;

export async function recordEmail(db: Database | ScopedTransaction, email: RecordedEmail): Promise<void> {
  await db.insert(emailMessages).values({ ...email, status: email.status ?? (email.transport === "brevo" ? "sent" : "local_only") });
}

/** Emails for the console's Deliveries page, newest first. */
export async function listEmailDeliveries(db: Database, filter: DeliveryListFilter): Promise<StoredEmail[]> {
  const conditions: SQL[] = [];
  if (filter.failedOnly) conditions.push(eq(emailMessages.status, "failed"));
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

/** Records another try at sending an email: its result, Brevo's id, the reason it failed, one more attempt. */
export async function updateEmailDelivery(
  db: Database,
  id: string,
  attempt: { readonly status: EmailStatus; readonly providerMessageId: string | null; readonly error: string | null; readonly now: Date },
): Promise<void> {
  await db
    .update(emailMessages)
    .set({
      status: attempt.status,
      providerMessageId: attempt.providerMessageId,
      error: attempt.error,
      attempts: sql`${emailMessages.attempts} + 1`,
      lastAttemptAt: attempt.now,
    })
    .where(eq(emailMessages.id, id));
}

export async function listRecentEmails(db: Database, limit: number): Promise<StoredEmail[]> {
  return db.select(EMAIL_COLUMNS).from(emailMessages).orderBy(desc(emailMessages.createdAt)).limit(limit);
}

export async function findEmail(db: Database, id: string): Promise<StoredEmail | null> {
  const rows = await db.select(EMAIL_COLUMNS).from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Templates whose body carried a link that signs someone in. Their outbox rows go after a day. */
export const SIGN_IN_LINK_TEMPLATES = ["password-reset", "confirm-email", "setup-link", "staff-invite"] as const;
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
