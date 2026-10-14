import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  charges,
  DIRECTORY_PROMOTION_DAYS,
  directoryPromotions,
  type BillingCurrency,
  type DirectoryPaidTag,
} from "../schema";
import { lockBusinessForBilling } from "./billing";
import { MAX_DIRECTORY_SIGNAL_KEYS, TooManySignalKeysError } from "./directory";
import { directoryLookupSize, isEmptyDirectoryLookup, type DirectoryLookup } from "./directory-refs";
import { currentBusinessId } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * Paid listing tags. The customer opens a `listing_promotion` charge from the Listing page (openListingPromotionCharge,
 * staff connection, after the platform has checked the customer), pays it through the ordinary charge payment, and the
 * payment confirmation starts the week (startDirectoryPromotionForCharge, inside recordChargePayment's transaction).
 * The customer reads its weeks and flips `visible` through row-level security; the website reads active tags through
 * readActiveDirectoryPaidTags on the staff connection.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PROMOTION_MS = DIRECTORY_PROMOTION_DAYS * DAY_MS;

/** One paid week of a tag. See the `directory_promotions` table. */
export interface DirectoryPromotion {
  readonly id: string;
  readonly businessId: string;
  readonly tag: DirectoryPaidTag;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly chargeId: string;
  readonly visible: boolean;
  readonly createdAt: Date;
}

const PROMOTION_COLUMNS = {
  id: directoryPromotions.id,
  businessId: directoryPromotions.businessId,
  tag: directoryPromotions.tag,
  startsAt: directoryPromotions.startsAt,
  endsAt: directoryPromotions.endsAt,
  chargeId: directoryPromotions.chargeId,
  visible: directoryPromotions.visible,
  createdAt: directoryPromotions.createdAt,
} as const;

/**
 * The business's weeks that have not ended by `now`: the running one and any week booked after it, earliest first.
 * Works through row-level security (the Listing page) and on the staff connection (the staff console).
 */
export async function listUpcomingDirectoryPromotions(
  db: Runner,
  businessId: string,
  now: Date,
): Promise<DirectoryPromotion[]> {
  return db
    .select(PROMOTION_COLUMNS)
    .from(directoryPromotions)
    .where(and(eq(directoryPromotions.businessId, businessId), gt(directoryPromotions.endsAt, now)))
    .orderBy(asc(directoryPromotions.startsAt));
}

/** Why a new week of `tag` cannot be bought right now. */
export type PromotionPurchaseRefusal =
  /** A different tag is running (or booked): one tag at a time, so wait until it ends. */
  | "other-tag-running"
  /** The same tag already has its next week booked: pay for one week at a time. */
  | "next-week-booked";

/**
 * Whether a week of `tag` may be bought given the business's upcoming weeks (listUpcomingDirectoryPromotions): when
 * nothing is running, or to renew the running tag while no later week is booked yet. The Listing page shows the same
 * answer; openListingPromotionCharge checks it again under the lock.
 */
export function promotionPurchaseRefusal(
  upcoming: readonly Pick<DirectoryPromotion, "tag" | "startsAt">[],
  tag: DirectoryPaidTag,
  now: Date,
): PromotionPurchaseRefusal | null {
  if (upcoming.length === 0) return null;
  if (upcoming.some((week) => week.tag !== tag)) return "other-tag-running";
  if (upcoming.some((week) => week.startsAt.getTime() > now.getTime())) return "next-week-booked";
  return null;
}

/** An open promotion charge: which charge, and the tag paying it will start. */
export interface OpenPromotionCharge {
  readonly chargeId: string;
  readonly tag: DirectoryPaidTag;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
}

/** The business's open `listing_promotion` charge, or null. Works through row-level security. */
export async function findOpenPromotionCharge(db: Runner, businessId: string): Promise<OpenPromotionCharge | null> {
  const rows = await db
    .select({
      chargeId: charges.id,
      tag: charges.promotionTag,
      amountCents: charges.amountCents,
      currency: charges.currency,
    })
    .from(charges)
    .where(and(eq(charges.businessId, businessId), eq(charges.kind, "listing_promotion"), eq(charges.status, "open")))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  if (row.tag === null) throw new Error(`Promotion charge ${row.chargeId} has no tag`);
  return { chargeId: row.chargeId, tag: row.tag, amountCents: row.amountCents, currency: row.currency };
}

export interface OpenPromotionChargeInput {
  readonly businessId: string;
  readonly tag: DirectoryPaidTag;
  /** What the customer reads on Billing and the receipt, e.g. "Hot & New listing tag, 7 days". */
  readonly description: string;
  /** The week's net price, in paise. */
  readonly unitAmountCents: number;
  readonly taxRateBasisPoints: number;
  /** Worked out by the caller with chargedAmountCents. */
  readonly amountCents: number;
  readonly now: Date;
}

export type OpenPromotionChargeOutcome =
  | { readonly kind: "opened"; readonly chargeId: string }
  | { readonly kind: "refused"; readonly reason: PromotionPurchaseRefusal };

/**
 * The open charge for a week of `input.tag`, adding it when there is none and otherwise pointing the open one at this
 * tag (the customer changed their mind before paying; the price is the same). Refused, with nothing written, when the
 * business may not buy that week now (promotionPurchaseRefusal). Under the business's billing lock, the lock the
 * payment confirmation takes too, so the check and the week it guards cannot interleave. Staff connection only: the
 * caller has checked this is a paid customer with a listing.
 */
export async function openListingPromotionCharge(
  db: Database,
  input: OpenPromotionChargeInput,
): Promise<OpenPromotionChargeOutcome> {
  return db.transaction(async (tx) => {
    await lockBusinessForBilling(tx, input.businessId);
    const upcoming = await listUpcomingDirectoryPromotions(tx, input.businessId, input.now);
    const refusal = promotionPurchaseRefusal(upcoming, input.tag, input.now);
    if (refusal !== null) return { kind: "refused", reason: refusal };

    const values = {
      businessId: input.businessId,
      kind: "listing_promotion" as const,
      description: input.description,
      quantity: 1,
      unitAmountCents: input.unitAmountCents,
      taxRateBasisPoints: input.taxRateBasisPoints,
      amountCents: input.amountCents,
      currency: "INR" as const,
      createdByStaffId: null,
      promotionTag: input.tag,
    };
    const open = and(
      eq(charges.businessId, input.businessId),
      eq(charges.kind, "listing_promotion"),
      eq(charges.status, "open"),
    );
    const updated = await tx
      .update(charges)
      .set({
        promotionTag: values.promotionTag,
        description: values.description,
        unitAmountCents: values.unitAmountCents,
        taxRateBasisPoints: values.taxRateBasisPoints,
        amountCents: values.amountCents,
      })
      .where(open)
      .returning({ id: charges.id });
    const existing = updated[0];
    if (existing !== undefined) return { kind: "opened", chargeId: existing.id };

    const inserted = await tx.insert(charges).values(values).returning({ id: charges.id });
    const charge = inserted[0];
    if (charge === undefined) throw new Error("Inserting a listing promotion charge returned no row");
    return { kind: "opened", chargeId: charge.id };
  });
}

export interface StartPromotionInput {
  readonly chargeId: string;
  readonly businessId: string;
  readonly tag: DirectoryPaidTag;
  /** When the payment was confirmed: the week starts then, unless one is still running. */
  readonly now: Date;
}

/**
 * Starts the week a paid `listing_promotion` charge bought: at `now`, or exactly when the business's last week ends
 * if one is still running (a renewal), so weeks never overlap and a paid week is never cut short. A week bought while
 * the tag is switched off stays off. Idempotent on the charge: a second call returns the week the first started.
 * Called by recordChargePayment inside its transaction; takes the business's billing lock itself so it is safe on
 * its own too. Staff connection only.
 */
export async function startDirectoryPromotionForCharge(
  tx: ScopedTransaction,
  input: StartPromotionInput,
): Promise<DirectoryPromotion> {
  await lockBusinessForBilling(tx, input.businessId);
  const already = await tx
    .select(PROMOTION_COLUMNS)
    .from(directoryPromotions)
    .where(eq(directoryPromotions.chargeId, input.chargeId))
    .limit(1);
  if (already[0] !== undefined) return already[0];

  const latest = await tx
    .select({ endsAt: directoryPromotions.endsAt, visible: directoryPromotions.visible })
    .from(directoryPromotions)
    .where(and(eq(directoryPromotions.businessId, input.businessId), gt(directoryPromotions.endsAt, input.now)))
    .orderBy(desc(directoryPromotions.endsAt))
    .limit(1);
  const running = latest[0];
  const startsAt = running === undefined ? input.now : running.endsAt;

  const inserted = await tx
    .insert(directoryPromotions)
    .values({
      businessId: input.businessId,
      tag: input.tag,
      startsAt,
      endsAt: new Date(startsAt.getTime() + PROMOTION_MS),
      chargeId: input.chargeId,
      visible: running?.visible ?? true,
    })
    .returning(PROMOTION_COLUMNS);
  const promotion = inserted[0];
  if (promotion === undefined) throw new Error(`Starting the promotion for charge ${input.chargeId} returned no row`);
  return promotion;
}

/**
 * The customer's on/off switch: shows or hides its tag on the directory for the running week and any booked after it,
 * without giving any time back. Returns how many weeks it changed (0 when none is running). Tenant scope: the
 * business comes from the scope, and the column grant allows nothing else to change.
 */
export async function setOwnDirectoryPromotionVisible(
  tx: ScopedTransaction,
  visible: boolean,
  now: Date,
): Promise<number> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(directoryPromotions)
    .set({ visible, updatedAt: now })
    .where(and(eq(directoryPromotions.businessId, businessId), gt(directoryPromotions.endsAt, now)))
    .returning({ id: directoryPromotions.id });
  return rows.length;
}

/**
 * The paid tag each business in `lookup` is showing at `now`, for the website's signals: a client listing's, found by
 * its place (every address it has had is a legacy key of that place, so a page cached under an old address still gets
 * its tag), or, for a key no place has, by a listing that has no place yet at that address or one it had before
 * (directory_listings.previous_paths: the match before ids, until the backfill gives the listing its place). Keyed by
 * place id, or by that key. Only running weeks the client has not switched off count. At most
 * MAX_DIRECTORY_SIGNAL_KEYS businesses. Staff connection only.
 */
export async function readActiveDirectoryPaidTags(
  db: Database,
  lookup: DirectoryLookup,
  now: Date,
): Promise<ReadonlyMap<string, DirectoryPaidTag>> {
  const size = directoryLookupSize(lookup);
  if (size > MAX_DIRECTORY_SIGNAL_KEYS) throw new TooManySignalKeysError(size);
  if (isEmptyDirectoryLookup(lookup)) return new Map();

  const placeIds = [...new Set(lookup.placeIds)];
  const unplacedKeys = [...new Set(lookup.unplacedKeys)];
  // A previous path /in/<category>/<state>/<city>/<area>/<slug> drops its state to become a key.
  const result = await db.execute<{ business: string; tag: DirectoryPaidTag }>(sql`
    with unplaced_listing_keys as (
      select l.business_id, l.category_slug || '/' || l.city_slug || '/' || l.area_slug || '/' || l.slug as listing_key
      from directory_listings l
      where l.place_id is null
      union
      select l.business_id,
        regexp_replace(previous.path, '^/in/([^/]+)/[^/]+/([^/]+)/([^/]+)/([^/]+)$', '\\1/\\2/\\3/\\4') as listing_key
      from directory_listings l
      cross join lateral unnest(l.previous_paths) as previous(path)
      where l.place_id is null and previous.path ~ '^/in/[^/]+/[^/]+/[^/]+/[^/]+/[^/]+$'
    ),
    listings as (
      select l.business_id, l.place_id as business
      from directory_listings l
      where l.place_id = any(${sql.param(placeIds)}::text[])
      union all
      select k.business_id, k.listing_key as business
      from unplaced_listing_keys k
      where k.listing_key = any(${sql.param(unplacedKeys)}::text[])
    )
    select distinct on (l.business) l.business, p.tag
    from listings l
    join ${directoryPromotions} p on p.business_id = l.business_id
    where p.visible
      and p.starts_at <= ${now}
      and p.ends_at > ${now}
    order by l.business, p.starts_at desc
  `);
  return new Map(result.rows.map((row) => [row.business, row.tag]));
}

/** The week showing on `now` for one business, for the staff console, or null. Staff connection only. */
export async function findRunningDirectoryPromotion(
  db: Database,
  businessId: string,
  now: Date,
): Promise<DirectoryPromotion | null> {
  const rows = await db
    .select(PROMOTION_COLUMNS)
    .from(directoryPromotions)
    .where(
      and(
        eq(directoryPromotions.businessId, businessId),
        lte(directoryPromotions.startsAt, now),
        gt(directoryPromotions.endsAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
