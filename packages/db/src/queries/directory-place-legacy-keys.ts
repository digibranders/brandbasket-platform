import { asc, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { directoryPlaceLegacyKeys } from "../schema";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

/**
 * The old <service>/<city>/<area>/<slug> addresses of each place, for the directory feed: one read for all of
 * `placeIds`, keys sorted so the feed is stable between calls. A place with no old address, and an unknown id, are
 * absent from the map.
 */
export async function listLegacyKeysByPlace(
  db: Runner,
  placeIds: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const unique = [...new Set(placeIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ placeId: directoryPlaceLegacyKeys.placeId, listingKey: directoryPlaceLegacyKeys.listingKey })
    .from(directoryPlaceLegacyKeys)
    .where(inArray(directoryPlaceLegacyKeys.placeId, unique))
    .orderBy(asc(directoryPlaceLegacyKeys.listingKey));
  const byPlace = new Map<string, string[]>();
  for (const { placeId, listingKey } of rows) {
    const keys = byPlace.get(placeId);
    if (keys === undefined) byPlace.set(placeId, [listingKey]);
    else keys.push(listingKey);
  }
  return byPlace;
}
