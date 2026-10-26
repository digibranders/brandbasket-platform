import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

export const ACTIVITY_ACTOR_KINDS = ["staff", "client", "system", "provider"] as const;
export type ActivityActorKind = (typeof ACTIVITY_ACTOR_KINDS)[number];

/**
 * One dated line of what happened to a business: who did it (staff, the client, the system, a provider such as
 * Razorpay), what kind of thing it was, and a summary written by code (never copied from customer text). The console
 * reads every row; the customer dashboard reads its own business's rows marked visible_to_client.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    actorKind: text("actor_kind").$type<ActivityActorKind>().notNull(),
    actorId: text("actor_id"),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    visibleToClient: boolean("visible_to_client").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_events_business_created_idx").on(table.businessId, table.createdAt),
    check("activity_events_actor_kind_check", sql`${table.actorKind} in ('staff', 'client', 'system', 'provider')`),
    check("activity_events_kind_check", sql`char_length(${table.kind}) between 1 and 64`),
    check("activity_events_summary_check", sql`char_length(${table.summary}) between 1 and 300`),
  ],
);
