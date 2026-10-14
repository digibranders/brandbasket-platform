import { and, asc, eq, exists, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businessNotClosing } from "./account-closures";
import { toPlaceUrlSlug } from "../place-id";
import type { ScopedTransaction } from "../scope";
import { businesses, businessProfiles, directoryListings, directoryPlaces, listingContent, projects } from "../schema";
import {
  createPlatformPlace,
  findPlaces,
  isListingKey,
  isPlaceRegistryImported,
  lockPlaceUrl,
  holdPlaceRegistryShared,
  PlaceRegistryNotImportedError,
  registerLegacyKeys,
  resolveLegacyKeys,
  UnknownPlaceError,
} from "./directory-places";
import { currentBusinessId, hasPostgresCode, postgresConstraintOf, UNIQUE_VIOLATION } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * Firstfold Local listings. Staff write the placement (saveListingPlacement, staff connection); the customer reads
 * both rows and updates only the content (findOwnListing / updateOwnListingContent, tenant scope, business id from
 * currentBusinessId(tx)); the feed route reads every live listing (listLiveDirectoryListings, staff connection).
 *
 * A listing is one directory business, its place (directory_places, docs/superpowers/plans/2026-10-01-directory-
 * permanent-listing-id.md Task 8): the place's id and URL label are fixed on the first save and never follow a later
 * move. The slug stays the legacy address's last part until the contract step (Task 13); it no longer decides the URL.
 */

/** What staff place: the listing's address parts, its pin and its buttons, as stored. */
export interface ListingPlacementFields {
  readonly categorySlug: string;
  readonly stateCode: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly slug: string;
  readonly lat: number;
  readonly lon: number;
  readonly pinLabel: string;
  readonly whatsappPhone: string | null;
  readonly bookingUrl: string | null;
  readonly replacesSourcePath: string | null;
}

export interface ListingPlacementInput extends ListingPlacementFields {
  /**
   * For a listing that has no place yet: the directory business (place id) staff chose for it to take over, keeping
   * that business's id, URL and reviews. Null lets replacesSourcePath, then the listing's own address, decide
   * (placeOfNewListing). A listing that already has a place keeps it; naming another is refused.
   */
  readonly takeOverPlaceId: string | null;
}

export interface ListingPlacement extends ListingPlacementFields {
  readonly businessId: string;
  readonly previousPaths: readonly string[];
  /** The business's permanent directory_places id; null until the place backfill (or, later, placement) gives it one. */
  readonly placeId: string | null;
}

export interface ListingButtonsRow {
  readonly call: boolean;
  readonly whatsapp: boolean;
  readonly book: boolean;
  readonly directions: boolean;
  readonly website: boolean;
}

export interface ListingContentRow {
  readonly about: string | null;
  /** The tagline card's line, or null for no card, and its colour (a LISTING_TAGLINE_COLOURS name). */
  readonly tagline: string | null;
  readonly taglineColour: string;
  readonly tags: readonly string[];
  readonly buttons: ListingButtonsRow;
  readonly visible: boolean;
}

export interface ListingContentPatch {
  readonly about?: string | null;
  readonly tagline?: string | null;
  readonly taglineColour?: string;
  readonly tags?: readonly string[];
  readonly buttons?: ListingButtonsRow;
  readonly visible?: boolean;
}

/** Another business already has this exact address (directory_listings_address_key). */
export class ListingAddressTakenError extends Error {
  constructor(path: string) {
    super(`Another business already has the listing address ${path}.`);
    this.name = "ListingAddressTakenError";
  }
}

/** The directory business staff asked this listing to take over cannot be: another listing is it, or its owner added it. */
export class ListingPlaceTakenError extends Error {
  constructor(
    readonly placeId: string,
    /** `listing`: another client's listing is that business. `added`: its owner added it, so it is theirs. */
    readonly reason: "listing" | "added",
  ) {
    super(
      reason === "added"
        ? `Directory business ${placeId} was added by its owner and cannot be taken over.`
        : `Another client's listing is already directory business ${placeId}.`,
    );
    this.name = "ListingPlaceTakenError";
  }
}

/**
 * The listing already is one directory business and staff named another for it to take over. A place is a business's
 * identity (its reviews, its URL), so a listing never moves to another one.
 */
export class ListingPlaceFixedError extends Error {
  constructor(
    readonly placeId: string,
    readonly requestedPlaceId: string,
  ) {
    super(`This listing is directory business ${placeId}; it cannot become ${requestedPlaceId}.`);
    this.name = "ListingPlaceFixedError";
  }
}

/** Only one listing may have a place (0077). */
const LISTING_PLACE_INDEX = "directory_listings_place_id_idx";

type ListingAddressParts = Pick<ListingPlacementFields, "categorySlug" | "stateCode" | "citySlug" | "areaSlug" | "slug">;

/** The listing's address on Firstfold Local: /in/<category>/<state>/<city>/<area>/<slug>. */
export function listingPath(placement: ListingAddressParts): string {
  const { categorySlug, stateCode, citySlug, areaSlug, slug } = placement;
  return `/in/${categorySlug}/${stateCode}/${citySlug}/${areaSlug}/${slug}`;
}

/** /in/<category>/<state>/<city>/<area>/<slug>, the page address directory_listings stores. */
const LISTING_PATH_PATTERN = /^\/in\/([^/]+)\/[^/]+\/([^/]+)\/([^/]+)\/([^/]+)$/;

/**
 * A listing page's address as its key, `<category>/<city>/<area>/<slug>` (the state is not part of a key); null for a
 * path that is not one.
 */
export function listingKeyOfPath(path: string): string | null {
  const match = LISTING_PATH_PATTERN.exec(path);
  if (match === null) return null;
  const key = match.slice(1).join("/");
  return isListingKey(key) ? key : null;
}

const PLACEMENT_COLUMNS = {
  businessId: directoryListings.businessId,
  categorySlug: directoryListings.categorySlug,
  stateCode: directoryListings.stateCode,
  citySlug: directoryListings.citySlug,
  areaSlug: directoryListings.areaSlug,
  slug: directoryListings.slug,
  lat: directoryListings.lat,
  lon: directoryListings.lon,
  pinLabel: directoryListings.pinLabel,
  whatsappPhone: directoryListings.whatsappPhone,
  bookingUrl: directoryListings.bookingUrl,
  replacesSourcePath: directoryListings.replacesSourcePath,
  previousPaths: directoryListings.previousPaths,
  placeId: directoryListings.placeId,
} as const;

const CONTENT_COLUMNS = {
  about: listingContent.about,
  tagline: listingContent.tagline,
  taglineColour: listingContent.taglineColour,
  tags: listingContent.tags,
  showCall: listingContent.showCall,
  showWhatsapp: listingContent.showWhatsapp,
  showBook: listingContent.showBook,
  showDirections: listingContent.showDirections,
  showWebsite: listingContent.showWebsite,
  visible: listingContent.visible,
} as const;

interface ContentSelect {
  readonly about: string | null;
  readonly tagline: string | null;
  readonly taglineColour: string;
  readonly tags: string[];
  readonly showCall: boolean;
  readonly showWhatsapp: boolean;
  readonly showBook: boolean;
  readonly showDirections: boolean;
  readonly showWebsite: boolean;
  readonly visible: boolean;
}

function toContent(row: ContentSelect): ListingContentRow {
  return {
    about: row.about,
    tagline: row.tagline,
    taglineColour: row.taglineColour,
    tags: row.tags,
    buttons: {
      call: row.showCall,
      whatsapp: row.showWhatsapp,
      book: row.showBook,
      directions: row.showDirections,
      website: row.showWebsite,
    },
    visible: row.visible,
  };
}

export async function findListingPlacement(db: Runner, businessId: string): Promise<ListingPlacement | null> {
  const rows = await db
    .select(PLACEMENT_COLUMNS)
    .from(directoryListings)
    .where(eq(directoryListings.businessId, businessId))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether another business's listing already has `placeId`. */
async function placeHasOtherListing(tx: ScopedTransaction, placeId: string, businessId: string): Promise<boolean> {
  const rows = await tx
    .select({ businessId: directoryListings.businessId })
    .from(directoryListings)
    .where(and(eq(directoryListings.placeId, placeId), ne(directoryListings.businessId, businessId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * The client becomes this directory business: its place is a client's from now on (its id and URL stay). Only an
 * open-data business, or a client place no listing has, can be taken over. A business its owner added is that owner's,
 * whatever its claim says (a rejected claim can still be approved), and another listing's place is that client's:
 * either would leave two businesses on one id, so both are refused with ListingPlaceTakenError.
 */
async function takeOverPlace(tx: ScopedTransaction, placeId: string, businessId: string, now: Date): Promise<string> {
  const found = (await findPlaces(tx, [placeId])).get(placeId);
  if (found === undefined) throw new UnknownPlaceError(placeId);
  if (found.origin === "added") throw new ListingPlaceTakenError(placeId, "added");
  if (await placeHasOtherListing(tx, placeId, businessId)) throw new ListingPlaceTakenError(placeId, "listing");
  await tx
    .update(directoryPlaces)
    .set({ origin: "client", updatedAt: now })
    .where(and(eq(directoryPlaces.id, placeId), eq(directoryPlaces.origin, "open_data")));
  return placeId;
}

/**
 * The place a listing with none yet becomes, much as the backfill decides it for older listings (planClientListings):
 *   1. the business staff chose (takeOverPlaceId), which must exist and be one takeOverPlace allows;
 *   2. else the business its replaced address names, likewise;
 *   3. else the open-data business at its own address, unless another listing already is that business;
 *   4. else a fresh client place, its URL label the listing's city and slug (cut to the URL's length).
 * Only once the dataset's places are imported (isPlaceRegistryImported), which the caller checks.
 */
async function placeOfNewListing(
  tx: ScopedTransaction,
  businessId: string,
  listing: ListingPlacementInput,
  now: Date,
): Promise<string> {
  if (listing.takeOverPlaceId !== null) return takeOverPlace(tx, listing.takeOverPlaceId, businessId, now);

  const ownKey = listingKeyOf(listing);
  const replaced = await placeOfReplaced(tx, listing.replacesSourcePath);
  if (replaced !== undefined) return takeOverPlace(tx, replaced, businessId, now);
  const named = ownKey === null ? new Map<string, string>() : await resolveLegacyKeys(tx, [ownKey]);

  const atOwnAddress = ownKey === null ? undefined : named.get(ownKey);
  if (atOwnAddress !== undefined) {
    const found = (await findPlaces(tx, [atOwnAddress])).get(atOwnAddress);
    if (found?.origin === "open_data" && !(await placeHasOtherListing(tx, atOwnAddress, businessId))) {
      return takeOverPlace(tx, atOwnAddress, businessId, now);
    }
  }
  return createPlatformPlace(
    tx,
    { origin: "client", stateCode: listing.stateCode, citySlug: listing.citySlug, urlSlug: toPlaceUrlSlug(listing.slug) },
    now,
  );
}

/** The place a replaced listing address (replaces_source_path) names, if the registry knows it. */
async function placeOfReplaced(tx: ScopedTransaction, replacesSourcePath: string | null): Promise<string | undefined> {
  const key = replacesSourcePath === null ? null : listingKeyOfPath(replacesSourcePath);
  return key === null ? undefined : (await resolveLegacyKeys(tx, [key])).get(key);
}

/** The listing's address as a listing key; null for parts that do not make one (never, after the admin form's checks). */
function listingKeyOf(parts: Pick<ListingPlacementFields, "categorySlug" | "citySlug" | "areaSlug" | "slug">): string | null {
  const key = `${parts.categorySlug}/${parts.citySlug}/${parts.areaSlug}/${parts.slug}`;
  return isListingKey(key) ? key : null;
}

/**
 * Staff create or change a business's placement. When the address changes, the old one is appended to
 * previous_paths (and the new one removed from it, for a move back), so the directory can redirect every address the
 * listing ever had. The empty content row is created the first time, so the client has something to edit.
 *
 * A listing without a place gets one (placeOfNewListing), locked at once: a client's page is live, so its URL is
 * frozen, and a later move of area, category or slug leaves it as it is (staff change it with changePlaceUrl). Every
 * address the listing has had is registered as an old address of its place. Before the dataset's places are imported
 * a listing gets no place: the backfill decides it then (a business id named then is refused, with
 * PlaceRegistryNotImportedError). Throws ListingAddressTakenError, ListingPlaceTakenError, ListingPlaceFixedError,
 * UnknownPlaceError or PlaceRegistryNotImportedError, having written nothing.
 */
export async function saveListingPlacement(
  db: Database,
  businessId: string,
  input: ListingPlacementInput,
  now: Date,
): Promise<ListingPlacement> {
  const newPath = listingPath(input);
  const { takeOverPlaceId, ...fields } = input;
  // The place this save gave the listing, for the error when another listing took it first.
  let assigned: string | null = null;
  try {
    return await db.transaction(async (tx) => {
      // Before any row, and keeping "are the places imported yet" true for the whole save (holdPlaceRegistryShared).
      await holdPlaceRegistryShared(tx);
      // FOR UPDATE below locks nothing on a first save (no row yet), so two concurrent first saves would both see
      // previous_paths = [] and one address would be lost; this lock needs no row. Key namespaced as in business-facts.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('directory_listings:' || ${businessId}, 0))`);
      const existingRows = await tx
        .select(PLACEMENT_COLUMNS)
        .from(directoryListings)
        .where(eq(directoryListings.businessId, businessId))
        .for("update");
      const existing = existingRows[0];
      const oldPath = existing === undefined ? null : listingPath(existing);
      const kept = (existing?.previousPaths ?? []).filter((path) => path !== newPath);
      const previousPaths =
        oldPath !== null && oldPath !== newPath && !kept.includes(oldPath) ? [...kept, oldPath] : kept;

      let placeId = existing?.placeId ?? null;
      if (placeId !== null) {
        if (takeOverPlaceId !== null && takeOverPlaceId !== placeId) throw new ListingPlaceFixedError(placeId, takeOverPlaceId);
        // A newly replaced address that is another business's would have the listing stand for it: refused like an id.
        // One saved before (unchanged) is left alone, so a listing whose old replaced address since gained a place saves.
        if (input.replacesSourcePath !== existing?.replacesSourcePath) {
          const replaced = await placeOfReplaced(tx, input.replacesSourcePath);
          if (replaced !== undefined && replaced !== placeId) throw new ListingPlaceFixedError(placeId, replaced);
        }
      } else if (await isPlaceRegistryImported(tx)) {
        placeId = await placeOfNewListing(tx, businessId, input, now);
        assigned = placeId;
      } else if (takeOverPlaceId !== null) {
        throw new PlaceRegistryNotImportedError();
      }

      const values = { ...fields, previousPaths, placeId };
      const saved = await tx
        .insert(directoryListings)
        .values({ businessId, ...values })
        .onConflictDoUpdate({ target: directoryListings.businessId, set: { ...values, updatedAt: now } })
        .returning(PLACEMENT_COLUMNS);
      await tx.insert(listingContent).values({ businessId }).onConflictDoNothing({ target: listingContent.businessId });

      if (placeId !== null) {
        // Locking an already-locked place keeps its first lock time.
        await lockPlaceUrl(tx, placeId, now);
        const addresses = [newPath, ...previousPaths].flatMap((path) => {
          const key = listingKeyOfPath(path);
          return key === null ? [] : [key];
        });
        await registerLegacyKeys(tx, placeId, addresses);
      }

      const row = saved[0];
      if (row === undefined) throw new Error("Listing placement upsert returned no row");
      return row;
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) {
      // Two listings took the same business over at once: the other one committed first.
      if (assigned !== null && postgresConstraintOf(error) === LISTING_PLACE_INDEX) throw new ListingPlaceTakenError(assigned, "listing");
      throw new ListingAddressTakenError(newPath);
    }
    throw error;
  }
}

export interface OwnListing {
  readonly placement: ListingPlacement;
  readonly content: ListingContentRow;
}

/** The signed-in business's listing, or null when staff have not created one. */
export async function findOwnListing(tx: ScopedTransaction): Promise<OwnListing | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ placement: PLACEMENT_COLUMNS, content: CONTENT_COLUMNS })
    .from(directoryListings)
    .innerJoin(listingContent, eq(listingContent.businessId, directoryListings.businessId))
    .where(eq(directoryListings.businessId, businessId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { placement: row.placement, content: toContent(row.content) };
}

/** Writes the fields present in `patch`. False when the business has no listing row to update. */
export async function updateOwnListingContent(
  tx: ScopedTransaction,
  patch: ListingContentPatch,
  now: Date,
): Promise<boolean> {
  const businessId = await currentBusinessId(tx);
  const set: Partial<typeof listingContent.$inferInsert> = { updatedAt: now };
  if (patch.about !== undefined) set.about = patch.about;
  if (patch.tagline !== undefined) set.tagline = patch.tagline;
  if (patch.taglineColour !== undefined) set.taglineColour = patch.taglineColour;
  if (patch.tags !== undefined) set.tags = [...patch.tags];
  if (patch.visible !== undefined) set.visible = patch.visible;
  if (patch.buttons !== undefined) {
    set.showCall = patch.buttons.call;
    set.showWhatsapp = patch.buttons.whatsapp;
    set.showBook = patch.buttons.book;
    set.showDirections = patch.buttons.directions;
    set.showWebsite = patch.buttons.website;
  }
  const rows = await tx
    .update(listingContent)
    .set(set)
    .where(eq(listingContent.businessId, businessId))
    .returning({ businessId: listingContent.businessId });
  return rows.length > 0;
}

/** A website that has launched stays launched: a later redesign project in progress does not take the listing down. */
export async function hasLiveProject(db: Runner, businessId: string): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.businessId, businessId), eq(projects.status, "live")))
    .limit(1);
  return rows.length > 0;
}

export interface DirectoryListingRow {
  readonly businessId: string;
  readonly placement: ListingPlacement;
  readonly content: ListingContentRow;
  readonly name: string;
  readonly streetAddress: string;
  readonly phone: string | null;
  readonly websiteUrl: string | null;
  /** business_profiles.google_business_url as stored; the feed decides whether it is safe to pass on. */
  readonly googleProfileUrl: string | null;
}

function isPresent(part: string | null): part is string {
  return part !== null && part !== "";
}

/** "12 Gokhale Road, Thane 400602": the address lines, then the city and postal code on one part. */
function streetAddressOf(parts: {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
}): string {
  const cityLine = [parts.city, parts.postalCode].filter(isPresent).join(" ");
  return [parts.addressLine1, parts.addressLine2, cityLine].filter(isPresent).join(", ");
}

/** Every listing whose website has launched, for the public feed, in a stable order. Staff connection only. */
export async function listLiveDirectoryListings(db: Database): Promise<DirectoryListingRow[]> {
  const rows = await db
    .select({
      placement: PLACEMENT_COLUMNS,
      content: CONTENT_COLUMNS,
      name: businessProfiles.displayName,
      phone: businessProfiles.phone,
      addressLine1: businessProfiles.addressLine1,
      addressLine2: businessProfiles.addressLine2,
      city: businessProfiles.city,
      postalCode: businessProfiles.postalCode,
      websiteUrl: businesses.websiteUrl,
      googleProfileUrl: businessProfiles.googleBusinessUrl,
    })
    .from(directoryListings)
    .innerJoin(listingContent, eq(listingContent.businessId, directoryListings.businessId))
    .innerJoin(businessProfiles, eq(businessProfiles.businessId, directoryListings.businessId))
    .innerJoin(businesses, eq(businesses.id, directoryListings.businessId))
    .where(
      and(
        exists(
          db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.businessId, directoryListings.businessId), eq(projects.status, "live"))),
        ),
        businessNotClosing(directoryListings.businessId),
      ),
    )
    .orderBy(asc(directoryListings.businessId));
  return rows.map((row) => ({
    businessId: row.placement.businessId,
    placement: row.placement,
    content: toContent(row.content),
    name: row.name,
    streetAddress: streetAddressOf(row),
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    googleProfileUrl: row.googleProfileUrl,
  }));
}
