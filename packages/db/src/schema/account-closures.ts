import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/** Why an owner is leaving, as they chose it on the delete-account page. */
export const ACCOUNT_EXIT_REASONS = [
  "too_expensive",
  "not_enough_enquiries",
  "not_using",
  "missing_feature",
  "found_alternative",
  "closing_business",
  "other",
] as const;
export const accountExitReason = pgEnum("account_exit_reason", ACCOUNT_EXIT_REASONS);
export type AccountExitReason = (typeof ACCOUNT_EXIT_REASONS)[number];

/** `kept_with_offer`: they took the stay offer and the account stays. `deleted`: they went through with it. */
export const ACCOUNT_EXIT_OUTCOMES = ["kept_with_offer", "deleted"] as const;
export const accountExitOutcome = pgEnum("account_exit_outcome", ACCOUNT_EXIT_OUTCOMES);
export type AccountExitOutcome = (typeof ACCOUNT_EXIT_OUTCOMES)[number];

/** How long a closed account waits, restorable, before its personal data is erased. */
export const ACCOUNT_CLOSURE_GRACE_DAYS = 30;

/**
 * What an owner told us on the way out. It carries no user or business id on purpose: it must survive the erase of
 * the account it came from, and it is read as a pile of reasons, never as a message from a particular person.
 */
export const accountExitFeedback = pgTable(
  "account_exit_feedback",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    reason: accountExitReason("reason").notNull(),
    /** What they typed, if anything. */
    comment: text("comment"),
    /** The plan they were on (its code), or null for a free listing account. */
    planCode: text("plan_code"),
    /** The percentage off the stay offer showed them, or null when no offer was shown. */
    offerPercent: integer("offer_percent"),
    outcome: accountExitOutcome("outcome").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("account_exit_feedback_created_at_idx").on(table.createdAt),
    check(
      "account_exit_feedback_comment_check",
      sql`${table.comment} is null or (char_length(${table.comment}) between 1 and 1000 and ${table.comment} = btrim(${table.comment}))`,
    ),
    check("account_exit_feedback_offer_check", sql`${table.offerPercent} is null or ${table.offerPercent} between 1 and 99`),
    // Keeping the account is only ever the answer to an offer.
    check(
      "account_exit_feedback_kept_check",
      sql`${table.outcome} <> 'kept_with_offer' or ${table.offerPercent} is not null`,
    ),
  ],
);

/**
 * A request to delete an account. The account is signed out and locked at once, its plan is cancelled at the end of
 * the period it paid for, and nothing is erased until `eraseAfter`: signing in before then restores it. A row with
 * neither `restoredAt` nor `erasedAt` is an open closure, and a user has at most one.
 */
export const accountClosures = pgTable(
  "account_closures",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    eraseAfter: timestamp("erase_after", { withTimezone: true }).notNull(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("account_closures_one_open_per_user_idx")
      .on(table.userId)
      .where(sql`${table.restoredAt} is null and ${table.erasedAt} is null`),
    index("account_closures_erase_after_idx").on(table.eraseAfter),
    check("account_closures_erase_after_check", sql`${table.eraseAfter} > ${table.requestedAt}`),
    check("account_closures_closed_once_check", sql`not (${table.restoredAt} is not null and ${table.erasedAt} is not null)`),
  ],
);
