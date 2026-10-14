import { DIRECTORY_AREAS, DIRECTORY_CATEGORIES, DIRECTORY_CITIES, DIRECTORY_ORIGIN } from "@fynix/shared/lib/directory/places";

/*
 * What the Business profile's listing pick lists offer, and the email asking us to change a fixed listing.
 * Browser-safe and pure.
 */

/** The directory's host as an address is written, without the scheme. */
export const LISTING_ADDRESS_HOST = new URL(DIRECTORY_ORIGIN).host;

/**
 * An email to us asking to change a listing whose details are fixed (its claim is confirmed, or it is a listing the
 * directory already had), with the listing already named. Spaces are %20, as mail apps expect in a mailto link.
 */
export function listingChangeRequestHref(email: string, businessName: string, addressText: string): string {
  const subject = encodeURIComponent(`Change my listing: ${businessName}`);
  const body = encodeURIComponent(
    `Please change my listing (${addressText}).\n\nWhat to change (name, category, city, area, address or phone):\n`,
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

/** One row of a pick list: the slug that is stored, and the name the owner reads. */
export interface PickOption {
  readonly value: string;
  readonly label: string;
}

function byLabel(a: PickOption, b: PickOption): number {
  return a.label.localeCompare(b.label);
}

/** Every category, A to Z: the directory's own order is by size, which nobody can scan. */
export function categoryOptions(): readonly PickOption[] {
  return DIRECTORY_CATEGORIES.map((category) => ({ value: category.slug, label: category.label })).sort(byLabel);
}

/** Every city, in the directory's own order (largest first), which puts the likeliest pick on top. */
export function cityOptions(): readonly PickOption[] {
  return DIRECTORY_CITIES.map((city) => ({ value: city.slug, label: city.name }));
}

/** The chosen city's areas, A to Z; none until a city is chosen. */
export function areaOptions(citySlug: string | null): readonly PickOption[] {
  if (citySlug === null) return [];
  return DIRECTORY_AREAS.filter((area) => area.city === citySlug)
    .map((area) => ({ value: area.slug, label: area.name }))
    .sort(byLabel);
}

/** The options whose name has a word starting with each word typed, so "pet sh" finds "Pet shops". */
export function filterOptions(options: readonly PickOption[], typed: string): readonly PickOption[] {
  const wanted = typed.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (wanted.length === 0) return options;
  return options.filter((option) => {
    const words = option.label.toLowerCase().split(/[^a-z0-9]+/);
    return wanted.every((want) => words.some((word) => word.startsWith(want)));
  });
}
