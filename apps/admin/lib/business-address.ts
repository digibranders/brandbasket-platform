import { placeUrlPath } from "@fynix/shared/lib/directory/place-id";
import { DIRECTORY_ORIGIN, directoryCategoryPath } from "@fynix/shared/lib/directory/places";

/*
 * A directory business's public address, as the staff console shows and links it. Server-only (place-id uses
 * node:crypto). A business with a place is at its web address, /in/mh/business/<name>/<code>, the only one staff
 * should see. One without a place yet (an address the registry does not know, or a listing the backfill has not
 * reached) has no page of its own on the website, so it is shown as its category's page in its area.
 */

/** What placeUrlPath needs of a place. */
export interface AddressedPlace {
  readonly id: string;
  readonly stateCode: string;
  readonly urlSlug: string;
}

/** The full address: the place's web address, else the category page in the area of `listingKey`. */
export function businessAddressOf(place: AddressedPlace | null, listingKey: string): string {
  if (place !== null) return `${DIRECTORY_ORIGIN}${placeUrlPath(place)}`;
  const [category, , area] = listingKey.split("/");
  if (category === undefined || area === undefined) throw new Error(`Not a listing key: ${listingKey}`);
  return `${DIRECTORY_ORIGIN}${directoryCategoryPath(area, category)}`;
}
