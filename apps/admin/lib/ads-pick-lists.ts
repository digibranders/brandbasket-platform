import { AD_CATEGORIES, DIRECTORY_AREAS, DIRECTORY_CITIES } from "@firstfold/shared/lib/directory/places";

/** One entry of a staff pick list: the slug that is stored, and the name staff read. */
export interface AdsPickOption {
  readonly value: string;
  readonly label: string;
}

export interface AdsPickLists {
  /** The ad forms' categories, A to Z: only those with their own website page take ads. */
  readonly categories: readonly { readonly slug: string; readonly label: string }[];
  /** The place-an-ad form's areas, grouped under their city, both A to Z. */
  readonly areasByCity: readonly { readonly city: string; readonly areas: readonly AdsPickOption[] }[];
  /** Every city, A to Z: where a home page ad shows. */
  readonly cities: readonly AdsPickOption[];
  /** The cities a web address may move to, in the directory's own order, for the Change web address form. */
  readonly webAddressCities: readonly { readonly slug: string; readonly name: string }[];
}

/**
 * The Ads page's pick lists, read from the directory's places now. The geography catalog replaces those places in
 * place (packages/shared places.ts), so this is built on each request rather than once when the server starts: a
 * category or area added on the Geography page shows here without a restart.
 */
export function adsPickLists(): AdsPickLists {
  const byName = (a: { readonly name: string }, b: { readonly name: string }): number => a.name.localeCompare(b.name);
  const cities = [...DIRECTORY_CITIES].sort(byName);
  return {
    categories: [...AD_CATEGORIES].sort((a, b) => a.label.localeCompare(b.label)),
    areasByCity: cities.map((city) => ({
      city: city.name,
      areas: DIRECTORY_AREAS.filter((area) => area.city === city.slug)
        .sort(byName)
        .map((area) => ({ value: `${city.slug}/${area.slug}`, label: area.name })),
    })),
    cities: cities.map((city) => ({ value: city.slug, label: city.name })),
    webAddressCities: DIRECTORY_CITIES.map((city) => ({ slug: city.slug, name: city.name })),
  };
}
