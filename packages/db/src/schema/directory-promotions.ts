import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { charges } from "./billing";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { directoryPaidTag } from "./directory-paid-tags";

/** One payment buys this many days of a paid tag. Written into the table's CHECK as well. */
export const DIRECTORY_PROMOTION_DAYS = 7;

/**
 * A paid week of a tag on a client's Firstfold Local listing ("Hot & New · Ad"). A row exists only once its charge
 * (kind `listing_promotion`) is paid: the payment confirmation writes it, in the same transaction that marks the
 * charge paid, so there is never a week without money or money without a week. There is no auto-renew: every week is
 * its own payment and its own row.
 *
 * At most one tag runs at a time. A week starts when its payment is confirmed, or, when a week is already running
 * (renewing the same tag), exactly when the last one ends, so a business's rows never overlap. The payment
 * confirmation takes the business's billing lock before working that out.
 *
 * `visible` is the client's own switch: off hides the tag on the directory without giving the week back.
 */
export const directoryPromotions = pgTable(
  "directory_promotions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    tag: directoryPaidTag("tag").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** The paid charge that bought this week. Unique, so recording the same payment twice starts one week. */
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id),
    visible: boolean("visible").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_promotions_charge_id_key").on(table.chargeId),
    unique("directory_promotions_business_id_starts_at_key").on(table.businessId, table.startsAt),
    index("directory_promotions_business_id_ends_at_idx").on(table.businessId, table.endsAt),
    index("directory_promotions_ends_at_idx").on(table.endsAt),
    check(
      "directory_promotions_week_check",
      sql`${table.endsAt} = ${table.startsAt} + ${sql.raw(`interval '${DIRECTORY_PROMOTION_DAYS} days'`)}`,
    ),
  ],
);
