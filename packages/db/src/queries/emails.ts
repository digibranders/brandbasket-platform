import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { emailMessages } from "../schema";

export interface RecordedEmail {
  readonly toAddress: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly transport: string;
}

export interface StoredEmail extends RecordedEmail {
  readonly id: string;
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
  createdAt: emailMessages.createdAt,
} as const;

export async function recordEmail(db: Database | ScopedTransaction, email: RecordedEmail): Promise<void> {
  await db.insert(emailMessages).values(email);
}

export async function listRecentEmails(db: Database, limit: number): Promise<StoredEmail[]> {
  return db.select(EMAIL_COLUMNS).from(emailMessages).orderBy(desc(emailMessages.createdAt)).limit(limit);
}

export async function findEmail(db: Database, id: string): Promise<StoredEmail | null> {
  const rows = await db.select(EMAIL_COLUMNS).from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Templates whose body carried a link that signs someone in. Their outbox rows go after a day. */
export const SIGN_IN_LINK_TEMPLATES = ["password-reset", "confirm-email", "setup-link"] as const;
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
