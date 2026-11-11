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
    .where(
      and(
        eq(enquiries.businessId, businessId),
        eq(enquiries.status, "new"),
        // Taps and Google calls carry no identity, so they never wait for a reply; nor does a form with no contact details.
        sql`(${enquiries.kind} in ('chat', 'ad_lead') or (${enquiries.kind} = 'form' and coalesce(${enquiries.name}, ${enquiries.phone}, ${enquiries.email}) is not null))`,
      ),
    );
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

/** Either connection kind: only `execute` is needed, so a transaction works as well as the pool. */
type SqlRunner = Pick<Database, "execute">;

/**
 * The one mapping from a chat lead to an enquiry. `filter` narrows which leads (all, one business, one lead); a lead
 * whose name, phone or email has changed since (OyeChats sends the details in later events) is refreshed, and the
 * customer's status and note never are.
 */
async function copyChatLeads(db: SqlRunner, filter: SQL): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO enquiries (id, business_id, kind, source, name, phone, email, received_at, source_ref)
    SELECT gen_random_uuid(), l.business_id, 'chat', left(b.name, 120), left(l.name, 200), left(l.phone, 40), left(l.email, 320),
           l.captured_at, 'chatbot_lead:' || l.id
      FROM chatbot_leads l JOIN chatbots b ON b.id = l.chatbot_id
     WHERE ${filter}
    ON CONFLICT (business_id, kind, source_ref) DO UPDATE
       SET name = excluded.name, phone = excluded.phone, email = excluded.email, updated_at = now()
     WHERE (enquiries.name, enquiries.phone, enquiries.email) IS DISTINCT FROM (excluded.name, excluded.phone, excluded.email)
  `);
  return result.rowCount ?? 0;
}

/** The one mapping from a call, WhatsApp or form tap to an enquiry. Taps carry no identity. Never changes an existing row. */
async function copyTaps(db: SqlRunner, filter: SQL): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO enquiries (id, business_id, kind, source, received_at, source_ref)
    SELECT gen_random_uuid(), e.business_id,
           CASE e.kind WHEN 'call' THEN 'call_tap' WHEN 'whatsapp' THEN 'whatsapp_tap' ELSE 'form' END,
           'Website', e.occurred_at, 'site_event:' || e.id
      FROM site_events e
     WHERE ${filter}
    ON CONFLICT (business_id, kind, source_ref) DO NOTHING
  `);
  return result.rowCount ?? 0;
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
  return db.transaction(async (tx) => ({ chat: await copyChatLeads(tx, leadFilter), taps: await copyTaps(tx, eventFilter) }));
}

/**
 * Live write for one chat lead, called right after `recordChatbotLead`: adds the enquiry, or refreshes its name, phone
 * and email when a later delivery filled them in. Same mapping and same key as the backfill, so the two never disagree.
 * Staff connection only. Returns whether a row was added or refreshed.
 */
export async function upsertEnquiryFromChatLead(db: SqlRunner, leadId: string): Promise<boolean> {
  if (!isUuid(leadId)) throw new Error(`leadId must be a UUID, received "${leadId}"`);
  return (await copyChatLeads(db, sql`l.id = ${leadId}::uuid`)) > 0;
}

/** Live write for one site tap, called right after `recordSiteEvent`. Same mapping and key as the backfill. Staff connection only. */
export async function upsertEnquiryFromSiteEvent(db: SqlRunner, eventId: string): Promise<boolean> {
  if (!isUuid(eventId)) throw new Error(`eventId must be a UUID, received "${eventId}"`);
  return (await copyTaps(db, sql`e.id = ${eventId}::uuid`)) > 0;
}

export interface EnquiryContentsInput {
  readonly businessId: string;
  /** A form on the customer's site, or a lead from an ad. */
  readonly kind: Extract<EnquiryKind, "form" | "ad_lead">;
  readonly source: string | null;
  readonly name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly message: string | null;
  readonly receivedAt: Date;
  /** When these details must be erased. Always after `receivedAt`. */
  readonly retainUntil: Date;
  /** Names what it came from ("form:<id>", "meta_lead:<id>"), so a delivery that arrives twice adds one row. */
  readonly sourceRef: string;
}

const trimmedOrNull = (value: string | null): string | null => value?.trim() || null;

/**
 * Stores an enquirer's details from a form or an ad lead, with the date they must be erased by (gate G2: nothing calls
 * this unless ENQUIRY_FORM_CONTENTS_ENABLED is on; see `acceptEnquiryContents` in @brandbasket/shared). A repeat of the same
 * `sourceRef` changes nothing. Staff connection only. Returns whether a row was added.
 */
export async function recordEnquiryContents(db: Database, input: EnquiryContentsInput): Promise<boolean> {
  if (!isUuid(input.businessId)) throw new Error(`businessId must be a UUID, received "${input.businessId}"`);
  const details = { name: trimmedOrNull(input.name), phone: trimmedOrNull(input.phone), email: trimmedOrNull(input.email), message: trimmedOrNull(input.message) };
  if (Object.values(details).every((value) => value === null)) {
    throw new Error("An enquiry with contents needs at least one of name, phone, email or message. A tap with no details is counted by the site tracking.");
  }
  if (input.retainUntil.getTime() <= input.receivedAt.getTime()) throw new Error("retainUntil must be after receivedAt.");
  const rows = await db
    .insert(enquiries)
    .values({
      businessId: input.businessId,
      kind: input.kind,
      source: trimmedOrNull(input.source),
      ...details,
      receivedAt: input.receivedAt,
      retainUntil: input.retainUntil,
      sourceRef: input.sourceRef,
    })
    .onConflictDoNothing({ target: [enquiries.businessId, enquiries.kind, enquiries.sourceRef] })
    .returning({ id: enquiries.id });
  return rows.length > 0;
}

/** Account erasure: the enquirers' details go with the business. */
export async function eraseEnquiriesOfBusiness(db: Database | ScopedTransaction, businessId: string): Promise<void> {
  await db.delete(enquiries).where(eq(enquiries.businessId, businessId));
}
