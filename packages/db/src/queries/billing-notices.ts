import { and, between, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import { subscriptions } from "../schema";
import type { Subscription } from "./billing";

/**
 * Active subscriptions whose paid-up-front first term ends in [from, to]: the first full price charge is about to be taken.
 * Staff connection (the timer sweep reads across businesses).
 */
export async function listSubscriptionsEndingFirstTerm(db: Database, range: { readonly from: Date; readonly to: Date }): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(inArray(subscriptions.status, ["active"]), isNotNull(subscriptions.activatedAt), between(subscriptions.commitmentEndsAt, range.from, range.to)));
}

/**
 * Subscriptions that were running unpaid-for ("active" or "past_due", never "cancelled": a customer who ended their plan has not
 * lapsed) whose paid-through date fell in [from, to]. The caller decides which of them have really run out of access.
 */
export async function listSubscriptionsPaidThroughBetween(db: Database, range: { readonly from: Date; readonly to: Date }): Promise<Subscription[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(inArray(subscriptions.status, ["active", "past_due"]), isNotNull(subscriptions.activatedAt), between(subscriptions.paidThroughAt, range.from, range.to)));
}
