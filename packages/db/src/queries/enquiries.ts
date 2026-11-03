import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import {
  ENQUIRY_NOTE_MAX,
  enquiries,
  type Enquiry,
  type EnquiryKind,
  type EnquiryStatus,
} from "../schema/enquiries";
import type { ScopedTransaction } from "../scope";
import { currentBusinessId, isUuid } from "./tenant";

/**
 * Customer side: every function here takes the transaction withTenantScope opened on the app connection, and reads
 * the business from it. Row-level security limits the rows to that business as well.
 */

export interface EnquiryFilter {
  readonly status?: readonly EnquiryStatus[];
  readonly kind?: readonly EnquiryKind[];
  readonly limit: number;
  readonly offset?: number;
}

const MAX_PAGE = 200;

/** Newest first. */
export async function listEnquiries(tx: ScopedTransaction, filter: EnquiryFilter): Promise<Enquiry[]> {
  const businessId = await currentBusinessId(tx);
  const conditions: SQL[] = [eq(enquiries.businessId, businessId)];
  if (filter.status !== undefined && filter.status.length > 0) conditions.push(inArray(enquiries.status, [...filter.status]));
  if (filter.kind !== undefined && filter.kind.length > 0) conditions.push(inArray(enquiries.kind, [...filter.kind]));
  return tx
    .select()
    .from(enquiries)
    .where(and(...conditions))
    .orderBy(desc(enquiries.receivedAt), desc(enquiries.id))
    .limit(Math.min(Math.max(filter.limit, 1), MAX_PAGE))
    .offset(Math.max(filter.offset ?? 0, 0));
}

export async function findEnquiry(tx: ScopedTransaction, id: string): Promise<Enquiry | null> {
  if (!isUuid(id)) return null;
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .select()
    .from(enquiries)
    .where(and(eq(enquiries.id, id), eq(enquiries.businessId, businessId)))
    .limit(1);
  return row ?? null;
}

/** For the sidebar badge and Home: enquiries nobody has marked yet. */
export async function countNewEnquiries(tx: ScopedTransaction): Promise<number> {
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .select({ value: count() })
    .from(enquiries)
    .where(and(eq(enquiries.businessId, businessId), eq(enquiries.status, "new")));
  return row?.value ?? 0;
}

export interface EnquiryChange {
  readonly status?: EnquiryStatus;
  /** Null clears it. Trimmed; an empty note is stored as null. */
  readonly note?: string | null;
}

export class EnquiryNoteTooLongError extends Error {
  constructor() {
    super(`An enquiry note is at most ${ENQUIRY_NOTE_MAX} characters.`);
    this.name = "EnquiryNoteTooLongError";
  }
}

/**
 * Sets the status and/or the note: the only two things a customer may change (column grants in 0216). Returns the
 * updated row, or null when no enquiry of this business has that id, or when the user is a viewer (row-level
 * security leaves the row untouched).
 */
export async function updateEnquiry(tx: ScopedTransaction, id: string, change: EnquiryChange): Promise<Enquiry | null> {
  if (!isUuid(id)) return null;
  const note = change.note === undefined ? undefined : change.note === null ? null : change.note.trim() || null;
  if (note !== undefined && note !== null && note.length > ENQUIRY_NOTE_MAX) throw new EnquiryNoteTooLongError();
  if (change.status === undefined && note === undefined) return findEnquiry(tx, id);
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .update(enquiries)
    .set({
      ...(change.status === undefined ? {} : { status: change.status }),
      ...(note === undefined ? {} : { note }),
      updatedAt: new Date(),
    })
    .where(and(eq(enquiries.id, id), eq(enquiries.businessId, businessId)))
    .returning();
  return row ?? null;
}

// Staff side: the staff connection, no tenant scope.

export interface EnquiryBackfillResult {
  /** Rows added or refreshed from chatbot_leads. */
  readonly chat: number;
  /** Rows added from site_events (call, WhatsApp and form taps). */
  readonly taps: number;
}

/**
 * Copies chatbot leads and site taps into `enquiries`, on the staff connection. Safe to run any number of times:
 * `source_ref` names the row each came from, so a second run adds nothing. A chat lead whose name, phone or email has
 * changed since (OyeChats sends the details in later events) is refreshed; the customer's status and note never are.
 * Taps carry no identity, so their name, phone and email stay null. Pass `businessId` to backfill one business.
 */
export async function backfillEnquiries(db: Database, options: { readonly businessId?: string } = {}): Promise<EnquiryBackfillResult> {
  const { businessId } = options;
  if (businessId !== undefined && !isUuid(businessId)) throw new Error(`businessId must be a UUID, received "${businessId}"`);
  const leadFilter = businessId === undefined ? sql`true` : sql`l.business_id = ${businessId}::uuid`;
  const eventFilter = businessId === undefined ? sql`true` : sql`e.business_id = ${businessId}::uuid`;
  return db.transaction(async (tx) => {
    const chat = await tx.execute(sql`
      INSERT INTO enquiries (id, business_id, kind, source, name, phone, email, received_at, source_ref)
      SELECT gen_random_uuid(), l.business_id, 'chat', left(b.name, 120), left(l.name, 200), left(l.phone, 40), left(l.email, 320),
             l.captured_at, 'chatbot_lead:' || l.id
        FROM chatbot_leads l JOIN chatbots b ON b.id = l.chatbot_id
       WHERE ${leadFilter}
      ON CONFLICT (business_id, kind, source_ref) DO UPDATE
         SET name = excluded.name, phone = excluded.phone, email = excluded.email, updated_at = now()
       WHERE (enquiries.name, enquiries.phone, enquiries.email) IS DISTINCT FROM (excluded.name, excluded.phone, excluded.email)
    `);
    const taps = await tx.execute(sql`
      INSERT INTO enquiries (id, business_id, kind, source, received_at, source_ref)
      SELECT gen_random_uuid(), e.business_id,
             CASE e.kind WHEN 'call' THEN 'call_tap' WHEN 'whatsapp' THEN 'whatsapp_tap' ELSE 'form' END,
             'Website', e.occurred_at, 'site_event:' || e.id
        FROM site_events e
       WHERE ${eventFilter}
      ON CONFLICT (business_id, kind, source_ref) DO NOTHING
    `);
    return { chat: chat.rowCount ?? 0, taps: taps.rowCount ?? 0 };
  });
}

/** Account erasure: the enquirers' details go with the business. */
export async function eraseEnquiriesOfBusiness(db: Database | ScopedTransaction, businessId: string): Promise<void> {
  await db.delete(enquiries).where(eq(enquiries.businessId, businessId));
}
