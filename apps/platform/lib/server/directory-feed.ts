import "server-only";
import { hasBillingAccess } from "@firstfold/billing";
import {
  findBillingState,
  findDirectoryProfile,
  findPlaces,
  isModuleEnabled,
  listApprovedClaimedBusinesses,
  listBusinessProducts,
  listBusinessFaqs,
  listBusinessServices,
  listConfirmedAddedBusinesses,
  listExtraCategoriesByBusiness,
  listLegacyKeysByPlace,
  listLiveDirectoryListings,
  readLiveDirectoryPictures,
  readSiteFacts,
  type Database,
} from "@firstfold/db";
import { DEFAULT_BUSINESS_TIME_ZONE, localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { GALLERY_SLOTS } from "@firstfold/shared/lib/directory/pictures";
import { buildAddedFeedListing, buildAddedProfile, buildFeedListing, type FeedPlace } from "@firstfold/shared/lib/directory/feed";
import {
  DIRECTORY_FEED_VERSION,
  type DirectoryFeed,
  type DirectoryFeedAddedListing,
  type DirectoryFeedAddedProfile,
  type DirectoryFeedClaimedProfile,
  type DirectoryFeedListing,
} from "@firstfold/shared/lib/directory/feed-contract";

/**
 * The registry record of each place id, from one read of the places and one of their old addresses however many
 * businesses the feed has. An id the registry does not return is left out, and its business goes out as it did
 * before ids.
 */
async function readFeedPlaces(db: Database, placeIds: readonly string[]): Promise<ReadonlyMap<string, FeedPlace>> {
  const unique = [...new Set(placeIds)];
  if (unique.length === 0) return new Map();
  const [places, legacyKeys] = await Promise.all([findPlaces(db, unique), listLegacyKeysByPlace(db, unique)]);
  const feedPlaces = new Map<string, FeedPlace>();
  for (const [id, place] of places) {
    feedPlaces.set(id, { id, citySlug: place.citySlug, urlSlug: place.urlSlug, legacyKeys: legacyKeys.get(id) ?? [] });
  }
  return feedPlaces;
}

/** The place of a business that may not have one, in the feed's shape. */
function placeOf(places: ReadonlyMap<string, FeedPlace>, placeId: string | null): FeedPlace | null {
  return placeId === null ? null : (places.get(placeId) ?? null);
}

/**
 * What the owner of one business filled in on the Business profile tabs, in the feed's shape: the same for a business
 * the owner added and for a claim on one the directory already had. `pictures` holds the business's live pictures, by the
 * id or key they were read under.
 */
async function readOwnerProfile(
  db: Database,
  businessId: string,
  pictures: Readonly<Record<string, string | null | undefined>> | undefined,
  now: Date,
): Promise<DirectoryFeedAddedProfile> {
  const [profile, facts, services, products, faqs] = await Promise.all([
    findDirectoryProfile(db, businessId),
    readSiteFacts(db, businessId),
    listBusinessServices(db, businessId),
    listBusinessProducts(db, businessId),
    listBusinessFaqs(db, businessId),
  ]);
  const gallery = GALLERY_SLOTS.flatMap((slot) => pictures?.[slot] ?? []);
  const today = localDateIn(facts.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, now);
  return buildAddedProfile({ profile, facts, services, products, faqs, gallery, today });
}

/**
 * Every live listing and every owner-added business staff have confirmed, shaped for the directory. One query for the
 * listings, one for the added businesses and one each for all their places and old addresses, then three small reads
 * per listing: fine for the number of paying clients the directory has; revisit with a joined query past a few hundred.
 */
export async function readDirectoryFeed(db: Database, now: Date): Promise<DirectoryFeed> {
  const [rows, addedRows] = await Promise.all([listLiveDirectoryListings(db), listConfirmedAddedBusinesses(db)]);
  // An added business's pictures, by its place once it has one, else by its key.
  const addedPictures = await readLiveDirectoryPictures(db, {
    placeIds: addedRows.flatMap((row) => (row.placeId === null ? [] : [row.placeId])),
    unplacedKeys: addedRows.flatMap((row) => (row.placeId === null ? [row.listingKey] : [])),
  });
  const places = await readFeedPlaces(db, [
    ...rows.flatMap((row) => (row.placement.placeId === null ? [] : [row.placement.placeId])),
    ...addedRows.flatMap((row) => (row.placeId === null ? [] : [row.placeId])),
  ]);
  const extras = await listExtraCategoriesByBusiness(db, [...rows.map((row) => row.businessId), ...addedRows.map((row) => row.businessId)]);
  const listings = await Promise.all(
    rows.map(async (row): Promise<DirectoryFeedListing | null> => {
      const [billing, facts, bookingEnabled] = await Promise.all([
        findBillingState(db, row.businessId),
        readSiteFacts(db, row.businessId),
        isModuleEnabled(db, row.businessId, "appointments"),
      ]);
      const paid = billing !== null && hasBillingAccess(billing.subscription, now);
      const today = localDateIn(facts.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, now);
      return buildFeedListing({ row, facts, paid, bookingEnabled, today, place: placeOf(places, row.placement.placeId), alsoCategories: extras.get(row.businessId) });
    }),
  );
  // What each added business's owner filled in on the Business profile tabs.
  const addedProfiles = new Map(
    await Promise.all(
      addedRows.map(async (row) => [row.businessId, await readOwnerProfile(db, row.businessId, addedPictures.get(row.placeId ?? row.listingKey), now)] as const),
    ),
  );
  // And what the owner of a business the directory already had filled in: laid over its open-data row by its place id.
  // Only the profile goes: the name, address and phone stay the directory's, which staff checked at the claim.
  const claimedRows = await listApprovedClaimedBusinesses(db);
  const claimedPictures = await readLiveDirectoryPictures(db, { placeIds: claimedRows.map((row) => row.placeId), unplacedKeys: [] });
  const claimed: DirectoryFeedClaimedProfile[] = await Promise.all(
    claimedRows.map(async (row) => ({ id: row.placeId, profile: await readOwnerProfile(db, row.businessId, claimedPictures.get(row.placeId), now) })),
  );
  return {
    version: DIRECTORY_FEED_VERSION,
    generatedAt: now.toISOString(),
    listings: listings.filter((listing): listing is DirectoryFeedListing => listing !== null),
    added: addedRows
      .map((row) =>
        buildAddedFeedListing(
          row,
          addedPictures.get(row.placeId ?? row.listingKey)?.listing ?? null,
          placeOf(places, row.placeId),
          extras.get(row.businessId),
          addedProfiles.get(row.businessId),
        ),
      )
      .filter((listing): listing is DirectoryFeedAddedListing => listing !== null),
    claimed,
  };
}
