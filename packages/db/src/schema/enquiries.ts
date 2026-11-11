import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** How someone got in touch. Taps carry no identity: name, phone and email stay null for them. */
export const ENQUIRY_KINDS = ["chat", "form", "call_tap", "whatsapp_tap", "google_call", "ad_lead"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

/** Where the customer is with it. The customer sets it; nothing else moves it. */
export const ENQUIRY_STATUSES = ["new", "contacted", "won", "lost"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_NOTE_MAX = 1000;

/**
 * One person who got in touch with the customer's business, from any channel, in one list (plan 61 section 6).
 * Staff and jobs write rows on the staff connection; the customer reads their own and may change only `status` and
 * `note` (column grants in 0216). `source_ref` names the row it came from ("chatbot_lead:<id>", "site_event:<id>"), so
 * a backfill run twice adds nothing.
 */
export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: text("kind").$type<EnquiryKind>().notNull(),
    /** What the customer reads as the origin: the chatbot's name, "Website", a campaign. */
    source: text("source"),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    message: text("message"),
    status: text("status").$type<EnquiryStatus>().notNull().default("new"),
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    sourceRef: text("source_ref").notNull(),
    /**
     * When the enquirer's details must be erased (gate G2). Set when a form or ad lead stores contents; null for rows
     * that hold no details of this kind (taps, and chat leads, which OyeChats keeps under its own retention).
     */
    retainUntil: timestamp("retain_until", { withTimezone: true }),
    /** When the details were erased, by the retention job or on the enquirer's request. The row stays as a count. */
    detailsErasedAt: timestamp("details_erased_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("enquiries_business_kind_source_ref_idx").on(table.businessId, table.kind, table.sourceRef),
    index("enquiries_business_received_idx").on(table.businessId, table.receivedAt),
    index("enquiries_retain_until_idx")
      .on(table.retainUntil)
      .where(sql`${table.retainUntil} is not null and ${table.detailsErasedAt} is null`),
    check("enquiries_kind_check", sql`${table.kind} in ('chat', 'form', 'call_tap', 'whatsapp_tap', 'google_call', 'ad_lead')`),
    check("enquiries_status_check", sql`${table.status} in ('new', 'contacted', 'won', 'lost')`),
    check("enquiries_source_check", sql`${table.source} is null or char_length(${table.source}) <= 120`),
    check("enquiries_name_check", sql`${table.name} is null or char_length(${table.name}) <= 200`),
    check("enquiries_phone_check", sql`${table.phone} is null or char_length(${table.phone}) <= 40`),
    check("enquiries_email_check", sql`${table.email} is null or char_length(${table.email}) <= 320`),
    check("enquiries_message_check", sql`${table.message} is null or char_length(${table.message}) <= 5000`),
    check("enquiries_note_check", sql`${table.note} is null or char_length(${table.note}) <= ${sql.raw(String(ENQUIRY_NOTE_MAX))}`),
    check("enquiries_retain_until_check", sql`${table.retainUntil} is null or ${table.retainUntil} > ${table.receivedAt}`),
    check(
      "enquiries_erased_check",
      sql`${table.detailsErasedAt} is null or (${table.name} is null and ${table.phone} is null and ${table.email} is null and ${table.message} is null)`,
    ),
    check("enquiries_source_ref_check", sql`char_length(${table.sourceRef}) between 1 and 200`),
  ],
);
export type Enquiry = typeof enquiries.$inferSelect;
