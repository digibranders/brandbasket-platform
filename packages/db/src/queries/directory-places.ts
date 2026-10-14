import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Database } from "../client";
import { businessUrlCode, isPlaceCitySlug, isPlaceUrlChangeReason, isPlaceUrlSlug, newPlatformPlaceId } from "../place-id";
import * as schema from "../schema";
import { directoryPlaceLegacyKeys, directoryPlaces, directoryPlaceUrlChanges, type DirectoryPlaceOrigin } from "../schema";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

/*
 * The directory's place registry: every business's permanent id and locked URL label
 * (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). Staff connection only (see 0076): the
 * dataset import, the /api/directory/* routes, the staff console and the listing-account server code.
 */

export interface DirectoryPlace {
  readonly id: string;
  readonly origin: DirectoryPlaceOrigin;
  readonly stateCode: string;
  readonly citySlug: string;
  readonly urlSlug: string;
  readonly urlLockedAt: Date | null;
}

/** The URL's label: /in/mh/<citySlug>/business/<urlSlug>/<id>. */
export interface PlaceUrl {
  readonly citySlug: string;
  readonly urlSlug: string;
}

/** One entry of the dataset's place ledger (local-directory-data/thane/thane-place-ledger.json). */
export interface OpenDataPlaceRow extends PlaceUrl {
  readonly sourceRef: string;
  readonly id: string;
  /** The <service>/<city>/<area>/<slug> the business had before ids; null for rows added after the cutover. */
  readonly legacyKey: string | null;
}

export interface OpenDataImportResult {
  readonly created: number;
  readonly unchanged: number;
}

/** The dataset's places are all in Thane: the ledger is Maharashtra's, the URL's /mh/ segment. */
const OPEN_DATA_STATE_CODE = "mh";
/**
 * The state of a business the registry has no place for: every claim and listing from before places, and so from
 * before PIN codes, is in Thane, Maharashtra. Used wherever a missing place stands in for a state.
 */
export const PRE_PLACES_STATE_CODE = "mh";
/** A state's ISO 3166-2:IN code, lower case, as directory_places_state_code_check requires. */
const STATE_CODE_PATTERN = /^[a-z]{2}$/;
/** Ledger rows written per transaction: big enough to be quick, small enough to keep each IN list short. */
const IMPORT_BATCH_SIZE = 500;
/** Platform ids are a digit then six characters, 8 x 31^6 (about 7.1 billion); a few tries is plenty. */
const CREATE_ATTEMPTS = 5;

/** The page is live, so its URL label is frozen: only staff may change it, through changePlaceUrl. */
export class PlaceUrlLockedError extends Error {
  constructor(readonly placeId: string) {
    super(`Directory place ${placeId} is live; its URL can only be changed by staff.`);
    this.name = "PlaceUrlLockedError";
  }
}

/** A place that is not live yet has no URL to change: its owner may still edit it (updatePendingPlaceUrl). */
export class PlaceUrlNotLiveError extends Error {
  constructor(readonly placeId: string) {
    super(`Directory place ${placeId} is not live yet; change its URL with updatePendingPlaceUrl.`);
    this.name = "PlaceUrlNotLiveError";
  }
}

/** A city or name part that is not kebab-case, or a name part over PLACE_URL_SLUG_MAX characters. */
export class InvalidPlaceUrlError extends Error {
  constructor(readonly url: PlaceUrl) {
    super(`"${url.citySlug}/${url.urlSlug}" is not a valid directory URL label.`);
    this.name = "InvalidPlaceUrlError";
  }
}

/** A place's state is its two-letter code in lower case ("mh", "wb"), as the URL's /in/<state>/ segment has it. */
export class InvalidPlaceStateCodeError extends Error {
  constructor(readonly stateCode: string) {
    super(`"${stateCode}" is not a valid directory state code.`);
    this.name = "InvalidPlaceStateCodeError";
  }
}

/** A staff URL change needs a reason of 3 to 300 characters. */
export class InvalidPlaceUrlChangeReasonError extends Error {
  constructor() {
    super("A directory URL change needs a reason of 3 to 300 characters.");
    this.name = "InvalidPlaceUrlChangeReasonError";
  }
}

export class UnknownPlaceError extends Error {
  constructor(readonly placeId: string) {
    super(`There is no directory place ${placeId}.`);
    this.name = "UnknownPlaceError";
  }
}

/**
 * The dataset ledger contradicts the registry, or itself. The ledger is append-only, so this means it was edited by
 * hand: nothing in the failing batch is written, and the ledger must be restored from version control.
 */
export class PlaceLedgerMismatchError extends Error {
  constructor(detail: string) {
    super(`The place ledger disagrees with the directory registry: ${detail}. The ledger is append-only; restore it.`);
    this.name = "PlaceLedgerMismatchError";
  }
}

/**
 * A business id was named before the dataset's places were imported: there is nothing to take over yet, and deciding a
 * listing's place now could break the import for good (isPlaceRegistryImported).
 */
export class PlaceRegistryNotImportedError extends Error {
  constructor() {
    super("The directory's places are not imported yet, so a business id cannot be used. Run `pnpm directory:import-places` first.");
    this.name = "PlaceRegistryNotImportedError";
  }
}

/** Every id issued for a platform place was already taken; at these odds, the random source is broken. */
export class PlaceIdExhaustedError extends Error {
  constructor(attempts: number) {
    super(`Could not find a free directory place id in ${attempts} tries.`);
    this.name = "PlaceIdExhaustedError";
  }
}

/** Checked before any write, so a bad label is a typed error rather than a check-constraint violation. */
function assertValidPlaceUrl(url: PlaceUrl): void {
  if (!isPlaceCitySlug(url.citySlug) || !isPlaceUrlSlug(url.urlSlug)) throw new InvalidPlaceUrlError(url);
}

function assertValidStateCode(stateCode: string): void {
  if (!STATE_CODE_PATTERN.test(stateCode)) throw new InvalidPlaceStateCodeError(stateCode);
}

/**
 * Every import batch, and the place_id backfill (./directory-place-backfill), takes this lock first, so two writers of
 * the registry at once run one after the other instead of colliding.
 */
export const PLACE_REGISTRY_LOCK = "directory_places_import";

/**
 * Waits for any import or backfill to finish, and holds them off until the caller's transaction ends; other holders of
 * this shared lock run alongside. Every write that registers an address as a legacy key, or decides which place a
 * business is, takes it first, before any row lock: such a write in the middle of an import could claim an address a
 * later batch names (the import would then refuse the ledger for good), and one holding a row the backfill is about to
 * update while it waits for a table the backfill has locked would deadlock with it.
 */
export async function holdPlaceRegistryShared(tx: ScopedTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext(${PLACE_REGISTRY_LOCK}))`);
}

const PLACE_COLUMNS = {
  id: directoryPlaces.id,
  origin: directoryPlaces.origin,
  stateCode: directoryPlaces.stateCode,
  citySlug: directoryPlaces.citySlug,
  urlSlug: directoryPlaces.urlSlug,
  urlLockedAt: directoryPlaces.urlLockedAt,
} as const;

export async function findPlaces(db: Runner, ids: readonly string[]): Promise<ReadonlyMap<string, DirectoryPlace>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select(PLACE_COLUMNS).from(directoryPlaces).where(inArray(directoryPlaces.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The business whose website URL carries `code` (place-id.ts businessUrlCode), or null. The code is a keyed hash, not
 * stored, so it is matched by computing it: first among the places with the URL's name, then, for a stale name (the
 * website 301s those), among every place. Staff paste addresses one at a time, so the full pass is rare and cheap.
 */
export async function findPlaceByUrlCode(
  db: Runner,
  address: { readonly urlSlug: string; readonly code: string },
): Promise<DirectoryPlace | null> {
  const named = await db.select(PLACE_COLUMNS).from(directoryPlaces).where(eq(directoryPlaces.urlSlug, address.urlSlug));
  const byName = named.find((place) => businessUrlCode(place.id) === address.code);
  if (byName !== undefined) return byName;
  const ids = await db.select({ id: directoryPlaces.id }).from(directoryPlaces);
  const match = ids.find((row) => businessUrlCode(row.id) === address.code);
  return match === undefined ? null : ((await findPlaces(db, [match.id])).get(match.id) ?? null);
}

/** Four kebab segments, as directory_place_legacy_keys_listing_key_check requires. */
const LISTING_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){3}$/;
const LISTING_KEY_MAX = 200;

/** Whether `key` is a listing key the legacy-key table accepts: `<service>/<city>/<area>/<slug>`, at most 200 long. */
export function isListingKey(key: string): boolean {
  return key.length <= LISTING_KEY_MAX && LISTING_KEY_PATTERN.test(key);
}

/**
 * Whether the dataset's places have been imported (`directory:import-places`). Until they are, nothing may register an
 * address as a legacy key or decide a client listing's place: the address may be an open-data business's, and the
 * import would then refuse the ledger for good (PlaceLedgerMismatchError). The backfill does both once it has run.
 */
export async function isPlaceRegistryImported(db: Runner): Promise<boolean> {
  return (await db.$count(directoryPlaces, eq(directoryPlaces.origin, "open_data"))) > 0;
}

/**
 * Registers each key as an old address of `placeId`, so a request by that address (the website sends addresses until
 * it sends ids, Task 12 of the plan) reaches the place, and the address 301s to it once pages are found by id. An
 * address another place already has stays with that place: a live page keeps its address. Returns how many were added.
 */
export async function registerLegacyKeys(db: Runner, placeId: string, keys: readonly string[]): Promise<number> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return 0;
  const inserted = await db
    .insert(directoryPlaceLegacyKeys)
    .values(unique.map((listingKey) => ({ listingKey, placeId })))
    .onConflictDoNothing({ target: directoryPlaceLegacyKeys.listingKey })
    .returning({ listingKey: directoryPlaceLegacyKeys.listingKey });
  return inserted.length;
}

/** Old <service>/<city>/<area>/<slug> keys -> place id; unknown keys are absent. */
export async function resolveLegacyKeys(db: Runner, keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ listingKey: directoryPlaceLegacyKeys.listingKey, placeId: directoryPlaceLegacyKeys.placeId })
    .from(directoryPlaceLegacyKeys)
    .where(inArray(directoryPlaceLegacyKeys.listingKey, unique));
  return new Map(rows.map((row) => [row.listingKey, row.placeId]));
}

/** Refuses a ledger that names one id, source or legacy key twice, before anything is written. */
function assertLedgerHasNoRepeats(rows: readonly OpenDataPlaceRow[]): void {
  const ids = new Set<string>();
  const sources = new Set<string>();
  const legacyKeys = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new PlaceLedgerMismatchError(`id ${row.id} appears twice`);
    if (sources.has(row.sourceRef)) throw new PlaceLedgerMismatchError(`${row.sourceRef} appears twice`);
    if (row.legacyKey !== null && legacyKeys.has(row.legacyKey)) {
      throw new PlaceLedgerMismatchError(`legacy key ${row.legacyKey} appears twice`);
    }
    ids.add(row.id);
    sources.add(row.sourceRef);
    if (row.legacyKey !== null) legacyKeys.add(row.legacyKey);
  }
}

interface RegisteredPlace {
  readonly id: string;
  readonly sourceRef: string | null;
  /** The current label and every label staff changed it from: the ledger's label must be one of these. */
  readonly knownUrls: ReadonlySet<string>;
}

function urlKey(url: PlaceUrl): string {
  return `${url.citySlug}/${url.urlSlug}`;
}

/** The batch's places as the registry has them, found by id or by source, with every label each has had. */
async function registeredPlaces(tx: ScopedTransaction, batch: readonly OpenDataPlaceRow[]): Promise<RegisteredPlace[]> {
  const ids = batch.map((row) => row.id);
  const sources = batch.map((row) => row.sourceRef);
  const places = await tx
    .select({
      id: directoryPlaces.id,
      sourceRef: directoryPlaces.sourceRef,
      citySlug: directoryPlaces.citySlug,
      urlSlug: directoryPlaces.urlSlug,
    })
    .from(directoryPlaces)
    .where(or(inArray(directoryPlaces.id, ids), inArray(directoryPlaces.sourceRef, sources)));
  if (places.length === 0) return [];
  // A staff URL change moves the live label but not the ledger. The label the place went live with is the "from" of
  // one of its changes; which one is not decided by changed_at, a caller-supplied time that need not be in order.
  const previous = await tx
    .selectDistinct({
      placeId: directoryPlaceUrlChanges.placeId,
      citySlug: directoryPlaceUrlChanges.fromCitySlug,
      urlSlug: directoryPlaceUrlChanges.fromUrlSlug,
    })
    .from(directoryPlaceUrlChanges)
    .where(
      inArray(
        directoryPlaceUrlChanges.placeId,
        places.map((place) => place.id),
      ),
    );
  return places.map((place) => ({
    id: place.id,
    sourceRef: place.sourceRef,
    knownUrls: new Set([urlKey(place), ...previous.filter((row) => row.placeId === place.id).map(urlKey)]),
  }));
}

/** Imports one batch in the caller's transaction; returns how many places it created. */
async function importBatch(tx: ScopedTransaction, batch: readonly OpenDataPlaceRow[], now: Date): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLACE_REGISTRY_LOCK}))`);
  const registered = await registeredPlaces(tx, batch);
  const byId = new Map(registered.map((place) => [place.id, place]));
  const bySource = new Map(registered.flatMap((place) => (place.sourceRef === null ? [] : [[place.sourceRef, place] as const])));
  const legacyOwners = await resolveLegacyKeys(
    tx,
    batch.flatMap((row) => (row.legacyKey === null ? [] : [row.legacyKey])),
  );

  const fresh: OpenDataPlaceRow[] = [];
  for (const row of batch) {
    const place = byId.get(row.id);
    const sourcePlace = bySource.get(row.sourceRef);
    if (sourcePlace !== undefined && sourcePlace.id !== row.id) {
      throw new PlaceLedgerMismatchError(`${row.sourceRef} is place ${sourcePlace.id}, not ${row.id}`);
    }
    if (row.legacyKey !== null) {
      const owner = legacyOwners.get(row.legacyKey);
      // A known place already has its legacy key: they are written together, and never added afterwards.
      const expectedOwner = place === undefined ? undefined : row.id;
      if (owner !== expectedOwner) {
        throw new PlaceLedgerMismatchError(
          `legacy key ${row.legacyKey} belongs to ${owner ?? "no place"} in the registry, not ${row.id}`,
        );
      }
    }
    if (place === undefined) {
      fresh.push(row);
      continue;
    }
    if (place.sourceRef !== row.sourceRef) {
      throw new PlaceLedgerMismatchError(`place ${row.id} is ${place.sourceRef ?? "a platform place"}, not ${row.sourceRef}`);
    }
    if (!place.knownUrls.has(urlKey(row))) {
      throw new PlaceLedgerMismatchError(
        `place ${row.id} has never been ${urlKey(row)} (it has been ${[...place.knownUrls].join(", ")})`,
      );
    }
  }
  if (fresh.length === 0) return 0;

  await tx.insert(directoryPlaces).values(
    fresh.map((row) => ({
      id: row.id,
      origin: "open_data" as const,
      sourceRef: row.sourceRef,
      stateCode: OPEN_DATA_STATE_CODE,
      citySlug: row.citySlug,
      urlSlug: row.urlSlug,
      urlLockedAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const legacy = fresh.flatMap((row) => (row.legacyKey === null ? [] : [{ listingKey: row.legacyKey, placeId: row.id }]));
  if (legacy.length > 0) await tx.insert(directoryPlaceLegacyKeys).values(legacy);
  return fresh.length;
}

/**
 * Loads the dataset ledger. Open-data places are created already locked: their URL went live with the dataset. A
 * place already in the registry is left alone (its URL may since have been changed by staff, or taken over by a
 * client), but a ledger row that contradicts it is refused with PlaceLedgerMismatchError. Each batch of 500 commits on
 * its own, and a re-run after a failure picks up where it stopped.
 *
 * The whole run holds the registry lock (PLACE_REGISTRY_LOCK) on one connection, from the first batch to the last, so
 * concurrent imports queue rather than collide, and no platform write (holdPlaceRegistryShared) runs between two
 * batches: after the first commits the registry counts as imported, and a client saved then could take an address a
 * later batch names. Each batch takes the same lock again in its transaction, which the session already holds.
 */
export async function importOpenDataPlaces(
  db: Database,
  rows: readonly OpenDataPlaceRow[],
  now: Date,
): Promise<OpenDataImportResult> {
  assertLedgerHasNoRepeats(rows);
  const client = await db.$client.connect();
  let unlocked = false;
  try {
    const session = drizzle({ client, schema });
    await session.execute(sql`select pg_advisory_lock(hashtext(${PLACE_REGISTRY_LOCK}))`);
    try {
      let created = 0;
      for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(start, start + IMPORT_BATCH_SIZE);
        created += await session.transaction((tx) => importBatch(tx, batch, now));
      }
      return { created, unchanged: rows.length - created };
    } finally {
      await session.execute(sql`select pg_advisory_unlock(hashtext(${PLACE_REGISTRY_LOCK}))`);
      unlocked = true;
    }
  } finally {
    // A connection whose unlock never ran (it broke mid-run) is closed rather than pooled, which ends its session lock.
    client.release(!unlocked);
  }
}

/**
 * A new business made on the platform, with a fresh digit-first id, in its own state ("mh" for an opened district, else
 * its PIN's state). Unlocked: lockPlaceUrl freezes it when it goes live.
 */
export async function createPlatformPlace(
  db: Runner,
  input: PlaceUrl & { readonly origin: Exclude<DirectoryPlaceOrigin, "open_data">; readonly stateCode: string },
  now: Date,
): Promise<string> {
  assertValidPlaceUrl(input);
  assertValidStateCode(input.stateCode);
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const inserted = await db
      .insert(directoryPlaces)
      .values({
        id: newPlatformPlaceId(),
        origin: input.origin,
        stateCode: input.stateCode,
        citySlug: input.citySlug,
        urlSlug: input.urlSlug,
        urlLockedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: directoryPlaces.id })
      .returning({ id: directoryPlaces.id });
    const id = inserted[0]?.id;
    if (id !== undefined) return id;
  }
  throw new PlaceIdExhaustedError(CREATE_ATTEMPTS);
}

/** Tells a missing place from a locked one, after a guarded UPDATE matched nothing. */
async function placeExists(db: Runner, placeId: string): Promise<boolean> {
  return (await findPlaces(db, [placeId])).has(placeId);
}

/**
 * While an owner-added business awaits approval its URL may still change, and so may its state (an owner corrects a
 * Kolkata PIN to a Thane one); once it is live this refuses.
 */
export async function updatePendingPlaceUrl(
  db: Runner,
  placeId: string,
  url: PlaceUrl & { readonly stateCode: string },
  now: Date,
): Promise<void> {
  assertValidPlaceUrl(url);
  assertValidStateCode(url.stateCode);
  const updated = await db
    .update(directoryPlaces)
    .set({ stateCode: url.stateCode, citySlug: url.citySlug, urlSlug: url.urlSlug, updatedAt: now })
    .where(and(eq(directoryPlaces.id, placeId), isNull(directoryPlaces.urlLockedAt)))
    .returning({ id: directoryPlaces.id });
  if (updated.length > 0) return;
  throw (await placeExists(db, placeId)) ? new PlaceUrlLockedError(placeId) : new UnknownPlaceError(placeId);
}

/** The page goes live: its URL is frozen from now on. Locking again keeps the first time. */
export async function lockPlaceUrl(db: Runner, placeId: string, now: Date): Promise<void> {
  const locked = await db
    .update(directoryPlaces)
    .set({ urlLockedAt: now, updatedAt: now })
    .where(and(eq(directoryPlaces.id, placeId), isNull(directoryPlaces.urlLockedAt)))
    .returning({ id: directoryPlaces.id });
  if (locked.length === 0 && !(await placeExists(db, placeId))) throw new UnknownPlaceError(placeId);
}

/**
 * Staff only: change a live business's URL (a rebrand, a move to another city), audited in
 * directory_place_url_changes. The old URL keeps working: pages are found by id, and a stale label 301s. Takes a
 * transaction because the row is locked, read, updated and logged as one step. A place not live yet is refused with
 * PlaceUrlNotLiveError: until then its URL is the owner's to edit, through updatePendingPlaceUrl.
 */
export async function changePlaceUrl(
  tx: ScopedTransaction,
  placeId: string,
  url: PlaceUrl,
  by: { readonly staffUserId: string; readonly reason: string },
  now: Date,
): Promise<void> {
  assertValidPlaceUrl(url);
  const reason = by.reason.trim();
  if (!isPlaceUrlChangeReason(reason)) throw new InvalidPlaceUrlChangeReasonError();
  const [place] = await tx
    .select({ citySlug: directoryPlaces.citySlug, urlSlug: directoryPlaces.urlSlug, urlLockedAt: directoryPlaces.urlLockedAt })
    .from(directoryPlaces)
    .where(eq(directoryPlaces.id, placeId))
    .for("update");
  if (place === undefined) throw new UnknownPlaceError(placeId);
  if (place.urlLockedAt === null) throw new PlaceUrlNotLiveError(placeId);
  if (place.citySlug === url.citySlug && place.urlSlug === url.urlSlug) return;
  await tx
    .update(directoryPlaces)
    .set({ citySlug: url.citySlug, urlSlug: url.urlSlug, updatedAt: now })
    .where(eq(directoryPlaces.id, placeId));
  await tx.insert(directoryPlaceUrlChanges).values({
    placeId,
    fromCitySlug: place.citySlug,
    fromUrlSlug: place.urlSlug,
    toCitySlug: url.citySlug,
    toUrlSlug: url.urlSlug,
    reason,
    changedByUserId: by.staffUserId,
    changedAt: now,
  });
}
