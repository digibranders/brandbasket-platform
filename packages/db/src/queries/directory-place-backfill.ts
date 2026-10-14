import { and, asc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import { toPlaceUrlSlug } from "../place-id";
import {
  directoryAdBids,
  directoryAdWins,
  directoryClaims,
  directoryDailyCounts,
  directoryEnquiries,
  directoryListings,
  directoryPlaceLegacyKeys,
  directoryPlaces,
  directoryReviewOtps,
  directoryReviews,
  directoryStaffAds,
  directoryVerifications,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import { marketOfListing } from "./directory-ads";
import { listingKeyOfPath } from "./directory-listings";
import {
  createPlatformPlace,
  findPlaces,
  isPlaceRegistryImported,
  lockPlaceUrl,
  PLACE_REGISTRY_LOCK,
  PRE_PLACES_STATE_CODE,
  registerLegacyKeys,
  resolveLegacyKeys,
} from "./directory-places";

/*
 * Fills place_id on every directory table from the listing keys rows were written with (0077; Task 6 of
 * docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). Run once after `directory:import-places`, on
 * the staff connection, through `pnpm directory:backfill-places`. Safe to run again: a second run changes nothing.
 */

/** How long the backfill waits for its table locks before giving up (a Postgres interval; see backfillDirectoryPlaces). */
const BACKFILL_LOCK_TIMEOUT = "5s";

/** The tables that name a business by its listing key, in the order they are backfilled. */
const KEYED_TABLES = {
  directory_reviews: directoryReviews,
  directory_review_otps: directoryReviewOtps,
  directory_enquiries: directoryEnquiries,
  directory_verifications: directoryVerifications,
  directory_daily_counts: directoryDailyCounts,
  directory_claims: directoryClaims,
  directory_staff_ads: directoryStaffAds,
  directory_ad_bids: directoryAdBids,
  directory_ad_wins: directoryAdWins,
} as const satisfies Record<string, PgTable>;

type KeyedTable = keyof typeof KEYED_TABLES;
export type DirectoryPlaceTable = "directory_listings" | KeyedTable;

export interface DirectoryPlaceBackfillCounts {
  /** Rows given a place_id by this run. */
  readonly backfilled: number;
  /** Rows that name a business but still have no place_id: their key matches no place (a dead or renumbered URL). */
  readonly leftNull: number;
}

export interface DirectoryPlaceBackfillResult {
  readonly perTable: Readonly<Record<DirectoryPlaceTable, DirectoryPlaceBackfillCounts>>;
  /** Up to UNKNOWN_KEYS_SHOWN of the listing keys left without a place, in order. */
  readonly unknownKeys: readonly string[];
  /** Platform places made for client listings that replace nothing, and for owner-added businesses. */
  readonly createdPlaces: number;
  /** Open-data businesses a client listing took over (their origin is now `client`). */
  readonly takenOver: number;
  /** Old addresses registered as legacy keys of a place. */
  readonly legacyKeysAdded: number;
  /** Published reviews hidden because the same number had a newer one on the same place. */
  readonly reviewsHidden: number;
  /** Daily count rows added into another row of the same place, day and kind, and deleted. */
  readonly dailyCountsMerged: number;
  /** Verifications deleted because the same place had a later one. */
  readonly verificationsRemoved: number;
}

export interface DuplicateClaims {
  readonly placeId: string;
  readonly claimIds: readonly string[];
}

export interface DuplicateListings {
  readonly placeId: string;
  readonly businessIds: readonly string[];
}

/**
 * Two approved claims would land on one place: two owners were each confirmed for what is one business. Staff must
 * reject one (or move it to its own listing) first; the backfill changes nothing.
 */
export class DuplicateApprovedClaimsError extends Error {
  constructor(readonly conflicts: readonly DuplicateClaims[]) {
    super(
      `Approved directory claims share a place, so place ids cannot be backfilled: ${conflicts
        .map((conflict) => `place ${conflict.placeId} has claims ${conflict.claimIds.join(", ")}`)
        .join("; ")}. Reject all but one claim per place, then run the backfill again.`,
    );
    this.name = "DuplicateApprovedClaimsError";
  }
}

/**
 * Two client listings would land on one place (both replace the same directory business). Staff must point one of
 * them elsewhere first; the backfill changes nothing.
 */
export class DuplicateClientListingsError extends Error {
  constructor(readonly conflicts: readonly DuplicateListings[]) {
    super(
      `Client listings share a place, so place ids cannot be backfilled: ${conflicts
        .map((conflict) => `place ${conflict.placeId} is claimed by the listings of businesses ${conflict.businessIds.join(", ")}`)
        .join("; ")}. Change all but one listing's replaced page, then run the backfill again.`,
    );
    this.name = "DuplicateClientListingsError";
  }
}

/**
 * The backfill ran before the dataset's places were imported. It would make platform places for addresses that are
 * open-data businesses, and the import would then refuse the ledger for good, so it refuses instead and writes nothing.
 */
export class NoOpenDataPlacesError extends Error {
  constructor() {
    super(
      "There are no open-data directory places yet. Run `pnpm directory:import-places <ledger>` first, then the backfill.",
    );
    this.name = "NoOpenDataPlacesError";
  }
}

const UNKNOWN_KEYS_SHOWN = 50;
interface Tally {
  createdPlaces: number;
  takenOver: number;
  legacyKeysAdded: number;
}

/**
 * Where a client listing's place comes from: the one it already has, a directory business it takes over, or a new
 * one. `takeover` is the business its replaces_source_path names, or else the open-data business at its own address.
 */
type ListingTarget =
  | { readonly kind: "kept"; readonly placeId: string }
  | { readonly kind: "takeover"; readonly placeId: string }
  | { readonly kind: "new" };

interface ClientListingRow {
  readonly businessId: string;
  readonly categorySlug: string;
  readonly stateCode: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly slug: string;
  readonly replacesSourcePath: string | null;
  readonly previousPaths: readonly string[];
  readonly placeId: string | null;
}

function currentKeyOf(listing: ClientListingRow): string {
  return `${listing.categorySlug}/${listing.citySlug}/${listing.areaSlug}/${listing.slug}`;
}

function replacedKeyOf(listing: ClientListingRow): string | null {
  return listing.replacesSourcePath === null ? null : listingKeyOfPath(listing.replacesSourcePath);
}

/**
 * Decides every listing's place before anything is written. First what each listing says: the place it already has,
 * or the business its replaces_source_path names, unless that is a business its owner added (the listing then gets a
 * place of its own); two listings on one place are refused. Then a listing that says
 * nothing but sits at an open-data business's own address takes that business over, unless another listing already
 * does: the client is that business, on its page.
 */
async function planClientListings(
  tx: ScopedTransaction,
  listings: readonly ClientListingRow[],
): Promise<{ readonly listing: ClientListingRow; readonly target: ListingTarget }[]> {
  const keys = listings.flatMap((listing) => {
    const replaced = replacedKeyOf(listing);
    return replaced === null ? [currentKeyOf(listing)] : [currentKeyOf(listing), replaced];
  });
  const keyPlaces = await resolveLegacyKeys(tx, keys);
  const knownPlaces = await findPlaces(tx, [...keyPlaces.values()]);

  const named = listings.map((listing) => {
    const replacedKey = replacedKeyOf(listing);
    const replacedPlace = replacedKey === null ? undefined : keyPlaces.get(replacedKey);
    // A business its owner added is that owner's (as takeOverPlace in ./directory-listings rules): a listing that
    // names one as replaced gets a place of its own instead, rather than two businesses sharing one id.
    const replaced = replacedPlace === undefined || knownPlaces.get(replacedPlace)?.origin === "added" ? undefined : replacedPlace;
    const target: ListingTarget =
      listing.placeId !== null
        ? { kind: "kept", placeId: listing.placeId }
        : replaced !== undefined
          ? { kind: "takeover", placeId: replaced }
          : { kind: "new" };
    return { listing, target };
  });

  const byPlace = new Map<string, string[]>();
  for (const { listing, target } of named) {
    if (target.kind === "new") continue;
    byPlace.set(target.placeId, [...(byPlace.get(target.placeId) ?? []), listing.businessId]);
  }
  const conflicts = [...byPlace.entries()]
    .filter(([, businessIds]) => businessIds.length > 1)
    .map(([placeId, businessIds]) => ({ placeId, businessIds }));
  if (conflicts.length > 0) throw new DuplicateClientListingsError(conflicts);

  const taken = new Set(byPlace.keys());
  return named.map(({ listing, target }) => {
    if (target.kind !== "new") return { listing, target };
    const placeId = keyPlaces.get(currentKeyOf(listing));
    if (placeId === undefined || taken.has(placeId) || knownPlaces.get(placeId)?.origin !== "open_data") {
      return { listing, target };
    }
    taken.add(placeId);
    return { listing, target: { kind: "takeover", placeId } };
  });
}

/**
 * Gives every client listing its place (planClientListings). A listing that takes over a directory business keeps
 * that business's id (the same business, so its reviews and URL carry over); any other gets a fresh platform place,
 * locked because its page is live. The listing's current address and every earlier one become legacy keys of its
 * place, except an address another place already has: a live page keeps its address.
 */
async function backfillClientListings(tx: ScopedTransaction, now: Date, tally: Tally): Promise<number> {
  const listings: ClientListingRow[] = await tx
    .select({
      businessId: directoryListings.businessId,
      categorySlug: directoryListings.categorySlug,
      stateCode: directoryListings.stateCode,
      citySlug: directoryListings.citySlug,
      areaSlug: directoryListings.areaSlug,
      slug: directoryListings.slug,
      replacesSourcePath: directoryListings.replacesSourcePath,
      previousPaths: directoryListings.previousPaths,
      placeId: directoryListings.placeId,
    })
    .from(directoryListings)
    .orderBy(asc(directoryListings.createdAt), asc(directoryListings.businessId));
  const planned = await planClientListings(tx, listings);

  let backfilled = 0;
  for (const { listing, target } of planned) {
    let placeId: string;
    if (target.kind === "new") {
      placeId = await createPlatformPlace(
        tx,
        { origin: "client", stateCode: listing.stateCode, citySlug: listing.citySlug, urlSlug: toPlaceUrlSlug(listing.slug) },
        now,
      );
      tally.createdPlaces += 1;
    } else {
      placeId = target.placeId;
    }
    if (target.kind === "takeover") {
      const taken = await tx
        .update(directoryPlaces)
        .set({ origin: "client", updatedAt: now })
        .where(and(eq(directoryPlaces.id, placeId), ne(directoryPlaces.origin, "client")))
        .returning({ id: directoryPlaces.id });
      tally.takenOver += taken.length;
    }
    // A client's page is live, so its URL is frozen. Locking an already-locked place keeps its first lock time.
    await lockPlaceUrl(tx, placeId, now);

    const currentKey = currentKeyOf(listing);
    const earlierKeys = listing.previousPaths.flatMap((path) => {
      const key = listingKeyOfPath(path);
      return key === null ? [] : [key];
    });
    tally.legacyKeysAdded += await registerLegacyKeys(tx, placeId, [currentKey, ...earlierKeys]);

    if (target.kind !== "kept") {
      await tx.update(directoryListings).set({ placeId }).where(eq(directoryListings.businessId, listing.businessId));
      backfilled += 1;
    }
  }
  return backfilled;
}

/**
 * Gives every business an owner added (a claim with origin `added`, not rejected) its place: the one it has, the one
 * its key already names, or a fresh platform place with the key's city and slug as its URL. Its key is registered as
 * a legacy key of that place every run (unless another place has it), so an address its owner changed while the claim
 * waited is picked up by the next run. Locked once the claim is approved, because the business's page is then live; a
 * pending one stays editable by its owner. A rejected claim gets no place: it has no page and never will.
 */
async function backfillAddedBusinesses(tx: ScopedTransaction, now: Date, tally: Tally): Promise<void> {
  const claims = await tx
    .select({
      listingKey: directoryClaims.listingKey,
      status: directoryClaims.status,
      placeId: directoryClaims.placeId,
    })
    .from(directoryClaims)
    .where(and(eq(directoryClaims.origin, "added"), ne(directoryClaims.status, "rejected")))
    .orderBy(asc(directoryClaims.createdAt), asc(directoryClaims.id));
  const known = new Map(await resolveLegacyKeys(tx, claims.map((claim) => claim.listingKey)));

  for (const claim of claims) {
    let placeId = claim.placeId ?? known.get(claim.listingKey);
    if (placeId === undefined) {
      const { citySlug } = marketOfListing(claim.listingKey);
      const slug = claim.listingKey.slice(claim.listingKey.lastIndexOf("/") + 1);
      placeId = await createPlatformPlace(
        tx,
        { origin: "added", stateCode: PRE_PLACES_STATE_CODE, citySlug, urlSlug: toPlaceUrlSlug(slug) },
        now,
      );
      tally.createdPlaces += 1;
      known.set(claim.listingKey, placeId);
    }
    tally.legacyKeysAdded += await registerLegacyKeys(tx, placeId, [claim.listingKey]);
    if (claim.status === "approved") await lockPlaceUrl(tx, placeId, now);
  }
}

/** The place each row will have: the one it has, else the one its listing key names. */
function placeOf(table: { readonly placeId: AnyPgColumn; readonly listingKey: AnyPgColumn }): SQL {
  return sql`coalesce(${table.placeId}, (select k.place_id from ${directoryPlaceLegacyKeys} k where k.listing_key = ${table.listingKey}))`;
}

/** Refuses, naming them, approved claims that would share a place: directory_claims_place_id_approved_idx forbids it. */
async function assertOneApprovedClaimPerPlace(tx: ScopedTransaction): Promise<void> {
  const result = await tx.execute<{ place_id: string; claim_ids: string[] }>(sql`
    select place_id, array_agg(id::text order by id) as claim_ids
    from (
      select ${directoryClaims.id} as id, ${placeOf(directoryClaims)} as place_id
      from ${directoryClaims}
      where ${directoryClaims.status} = 'approved'
    ) approved
    where place_id is not null
    group by place_id
    having count(*) > 1
    order by place_id
  `);
  if (result.rows.length > 0) {
    throw new DuplicateApprovedClaimsError(result.rows.map((row) => ({ placeId: row.place_id, claimIds: row.claim_ids })));
  }
}

/**
 * One published review per number per place (directory_reviews_place_id_phone_idx): where reviews from one number
 * meet on one place, the most recently updated stays and the others are hidden, as staff would hide them. Hidden, not
 * deleted, so staff can still read and restore them.
 */
async function hideDuplicateReviews(tx: ScopedTransaction, now: Date): Promise<number> {
  const result = await tx.execute(sql`
    with ranked as (
      select id, row_number() over (
        partition by place_id, phone order by updated_at desc, created_at desc, id desc
      ) as rank
      from (
        select ${directoryReviews.id} as id, ${placeOf(directoryReviews)} as place_id, ${directoryReviews.phone} as phone,
          ${directoryReviews.updatedAt} as updated_at, ${directoryReviews.createdAt} as created_at
        from ${directoryReviews}
        where ${directoryReviews.status} = 'published'
      ) published
      where place_id is not null
    )
    update ${directoryReviews} set status = 'hidden', hidden_at = ${now}, updated_at = ${now}
    from ranked
    where ${directoryReviews.id} = ranked.id and ranked.rank > 1
  `);
  return result.rowCount ?? 0;
}

/**
 * One counter per place, day and kind (directory_daily_counts_place_day_kind_idx): where counters meet on one place,
 * their counts are added into one row and the others are deleted. The row kept is the one that already has the place,
 * else the first by key; the rows carry no time, so none of them is newer than another. Rows are told apart by ctid,
 * not by key: a counter written by place id has no listing key. The tables are locked for the run, so ctids hold.
 */
async function mergeDuplicateDailyCounts(tx: ScopedTransaction): Promise<number> {
  const result = await tx.execute(sql`
    with ranked as (
      select row_id,
        row_number() over (partition by place_id, day, kind order by has_place desc, listing_key nulls first) as rank,
        sum(amount) over (partition by place_id, day, kind) as total,
        count(*) over (partition by place_id, day, kind) as rows_in_group
      from (
        select ctid as row_id, ${directoryDailyCounts.listingKey} as listing_key, ${directoryDailyCounts.day} as day,
          ${directoryDailyCounts.kind} as kind, ${directoryDailyCounts.count} as amount,
          ${directoryDailyCounts.placeId} is not null as has_place, ${placeOf(directoryDailyCounts)} as place_id
        from ${directoryDailyCounts}
      ) counts
      where place_id is not null
    ),
    kept as (
      update ${directoryDailyCounts} set count = ranked.total
      from ranked
      where ${directoryDailyCounts}.ctid = ranked.row_id and ranked.rank = 1 and ranked.rows_in_group > 1
      returning 1
    )
    delete from ${directoryDailyCounts}
    using ranked
    where ${directoryDailyCounts}.ctid = ranked.row_id and ranked.rank > 1
  `);
  return result.rowCount ?? 0;
}

/**
 * One verification per place (directory_verifications_place_id_idx): where verifications meet on one place, the most
 * recent stays and the others are deleted. A verification is staff's own note about a business (0057 allows the
 * delete), and the one kept says what staff last confirmed.
 */
async function removeDuplicateVerifications(tx: ScopedTransaction): Promise<number> {
  const result = await tx.execute(sql`
    with ranked as (
      select listing_key,
        row_number() over (partition by place_id order by verified_at desc, has_place desc, listing_key) as rank
      from (
        select ${directoryVerifications.listingKey} as listing_key, ${directoryVerifications.verifiedAt} as verified_at,
          ${directoryVerifications.placeId} is not null as has_place, ${placeOf(directoryVerifications)} as place_id
        from ${directoryVerifications}
      ) verifications
      where place_id is not null
    )
    delete from ${directoryVerifications}
    using ranked
    where ${directoryVerifications.listingKey} = ranked.listing_key and ranked.rank > 1
  `);
  return result.rowCount ?? 0;
}

/** Sets place_id on every row whose listing key names a place and that has none yet. */
async function backfillKeyedTable(tx: ScopedTransaction, table: (typeof KEYED_TABLES)[KeyedTable]): Promise<number> {
  const result = await tx.execute(sql`
    update ${table} set place_id = k.place_id
    from ${directoryPlaceLegacyKeys} k
    where k.listing_key = ${table.listingKey} and ${table.placeId} is null
  `);
  return result.rowCount ?? 0;
}

/** Rows that name a business by key but have no place. A top-list enquiry names no business, so it never counts. */
async function countLeftNull(tx: ScopedTransaction, table: (typeof KEYED_TABLES)[KeyedTable]): Promise<number> {
  const result = await tx.execute<{ left_null: number }>(sql`
    select count(*)::int as left_null from ${table} where ${table.placeId} is null and ${table.listingKey} is not null
  `);
  return result.rows[0]?.left_null ?? 0;
}

async function unknownListingKeys(tx: ScopedTransaction): Promise<string[]> {
  const unions = sql.join(
    Object.values(KEYED_TABLES).map(
      (table) => sql`select ${table.listingKey} as listing_key from ${table} where ${table.placeId} is null and ${table.listingKey} is not null`,
    ),
    sql` union `,
  );
  const result = await tx.execute<{ listing_key: string }>(
    sql`select listing_key from (${unions}) unknown order by listing_key limit ${UNKNOWN_KEYS_SHOWN}`,
  );
  return result.rows.map((row) => row.listing_key);
}

/**
 * Fills place_id on every directory table, in one transaction under the registry lock, so it is all or nothing. It
 * refuses to start before `directory:import-places` has loaded the open-data places (NoOpenDataPlacesError). Then:
 *   1. client listings get their place (taking over the business they replace, or a fresh one);
 *   2. owner-added businesses get theirs;
 *   3. two approved claims on one place, or two client listings, refuse the whole run (typed errors naming them);
 *   4. rows that would break a place's one-per-business indexes are merged first (reviews hidden, daily counts
 *      added up, older verifications deleted);
 *   5. every keyed table takes the place its listing key names.
 * Rows whose key names no place keep a NULL place_id and are reported. A second run changes nothing. Staff connection.
 */
export async function backfillDirectoryPlaces(db: Database, now: Date): Promise<DirectoryPlaceBackfillResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLACE_REGISTRY_LOCK}))`);
    // Holds off writers on the tables with one-per-business rules (they can still be read) until the run commits, so
    // no row written by key mid-run can slip past a merge and break a place's unique index. Every write here is
    // short; the staff role has UPDATE on each, which this lock mode needs. The lock waits at most
    // BACKFILL_LOCK_TIMEOUT: a long transaction holding one of these tables makes the run fail at once (nothing is
    // written; run it again) instead of queueing every API write behind it while it waits. Later statements wait as
    // long as they need: by then the run holds what it needs.
    await tx.execute(sql`set local lock_timeout = ${sql.raw(`'${BACKFILL_LOCK_TIMEOUT}'`)}`);
    await tx.execute(
      sql`lock table ${directoryListings}, ${directoryClaims}, ${directoryReviews}, ${directoryDailyCounts}, ${directoryVerifications} in share row exclusive mode`,
    );
    await tx.execute(sql`set local lock_timeout = default`);
    if (!(await isPlaceRegistryImported(tx))) throw new NoOpenDataPlacesError();
    const tally: Tally = { createdPlaces: 0, takenOver: 0, legacyKeysAdded: 0 };

    const listingsBackfilled = await backfillClientListings(tx, now, tally);
    await backfillAddedBusinesses(tx, now, tally);
    await assertOneApprovedClaimPerPlace(tx);

    const reviewsHidden = await hideDuplicateReviews(tx, now);
    const dailyCountsMerged = await mergeDuplicateDailyCounts(tx);
    const verificationsRemoved = await removeDuplicateVerifications(tx);

    const keyed = async (table: (typeof KEYED_TABLES)[KeyedTable]): Promise<DirectoryPlaceBackfillCounts> => ({
      backfilled: await backfillKeyedTable(tx, table),
      leftNull: await countLeftNull(tx, table),
    });
    // One after another, in KEYED_TABLES' order: bids before the wins that copy them.
    const perTable: Record<DirectoryPlaceTable, DirectoryPlaceBackfillCounts> = {
      directory_listings: {
        backfilled: listingsBackfilled,
        leftNull: await tx.$count(directoryListings, isNull(directoryListings.placeId)),
      },
      directory_reviews: await keyed(KEYED_TABLES.directory_reviews),
      directory_review_otps: await keyed(KEYED_TABLES.directory_review_otps),
      directory_enquiries: await keyed(KEYED_TABLES.directory_enquiries),
      directory_verifications: await keyed(KEYED_TABLES.directory_verifications),
      directory_daily_counts: await keyed(KEYED_TABLES.directory_daily_counts),
      directory_claims: await keyed(KEYED_TABLES.directory_claims),
      directory_staff_ads: await keyed(KEYED_TABLES.directory_staff_ads),
      directory_ad_bids: await keyed(KEYED_TABLES.directory_ad_bids),
      directory_ad_wins: await keyed(KEYED_TABLES.directory_ad_wins),
    };

    return {
      perTable,
      unknownKeys: await unknownListingKeys(tx),
      createdPlaces: tally.createdPlaces,
      takenOver: tally.takenOver,
      legacyKeysAdded: tally.legacyKeysAdded,
      reviewsHidden,
      dailyCountsMerged,
      verificationsRemoved,
    };
  });
}
