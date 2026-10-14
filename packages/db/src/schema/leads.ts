import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { billingCurrency } from "./currency";
import { staffMembers } from "./staff";

/** Sales pipeline, from the Get started form to a paying customer. */
export const leadStatus = pgEnum("lead_status", [
  "new",
  "call_booked",
  "call_done",
  "agreed",
  "invite_sent",
  "account_created",
  "paid",
  "lost",
]);
export type LeadStatus = (typeof leadStatus.enumValues)[number];

export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    businessName: text("business_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    /** One of the marketing site's business types. Nullable because leads captured before the question existed have none. */
    businessType: text("business_type"),
    /** Set by staff on the call, never inferred from an IP address. */
    currency: billingCurrency("currency").notNull().default("USD"),
    message: text("message"),
    status: leadStatus("status").notNull().default("new"),
    /** Private to the team: what was agreed on the call. */
    notes: text("notes"),
    businessId: uuid("business_id").references(() => businesses.id),
    /**
     * Who attached an already-created account to this lead's business, and when. Set only by the staff repair
     * path: a customer whose account was created but whose business was not has no setup link left to redeem,
     * so the attachment is recorded here rather than on a setup invite that never existed.
     */
    attachedByStaffId: text("attached_by_staff_id").references(() => staffMembers.userId),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("leads_status_created_at_idx").on(table.status, table.createdAt)],
);
