import { z } from "zod";
import placesJson from "./places.json";

/**
 * The directory's fixed lists, copied from the website repo's content/local/thane-places.json and thane-taxonomy.json
 * (see "source" in the JSON). Owners and staff pick a listing's category, city and area from these, and the website
 * builds its /in addresses from the same slugs, so the two copies must stay in step: change both, like pricing and the
 * brand pieces. `categories` is every category a business may be listed in; `services` is the published ones, each
 * with its own page on the website, and only those take ads.
 */
const placesSchema = z.object({
  state: z.object({ code: z.string().regex(/^[a-z]{2}$/), name: z.string() }),
  district: z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), name: z.string() }),
  cities: z.array(z.object({ slug: z.string(), name: z.string() })),
  areas: z.array(z.object({ slug: z.string(), name: z.string(), city: z.string() })),
  categories: z.array(z.object({ slug: z.string(), label: z.string() })),
  services: z.array(z.object({ slug: z.string(), label: z.string() })),
});

const PLACES = placesSchema.parse(placesJson);

export interface DirectoryCity {
  readonly slug: string;
  readonly name: string;
}

export interface DirectoryArea extends DirectoryCity {
  /** Slug of the city the area belongs to. */
  readonly city: string;
}

export interface DirectoryCategory {
  readonly slug: string;
  readonly label: string;
}

export const DIRECTORY_STATE: { readonly code: string; readonly name: string } = PLACES.state;
/** The district every area belongs to (the only one so far): the segment after /in/<state> on the website. */
export const DIRECTORY_DISTRICT: { readonly slug: string; readonly name: string } = PLACES.district;

/*
 * The lists below start as places.json and, when the geography catalog is read from the database
 * (geo-catalog-source.ts), are replaced in place by its rows, so every importer sees the change without a code edit.
 * They live on globalThis because Next bundles this module more than once (pages, actions, routes) and the copies must
 * share one set of arrays. places.json stays as the fallback when the catalog is empty or unreachable.
 */
interface PlacesStore {
  readonly cities: DirectoryCity[];
  readonly areas: DirectoryArea[];
  readonly categories: DirectoryCategory[];
  readonly services: DirectoryCategory[];
  /** Every category by slug, switched-off ones too: a business already in one still shows its name. */
  readonly labels: Map<string, string>;
}

const STORE_KEY = Symbol.for("fynix.directory.places");
const storeHost = globalThis as typeof globalThis & { [STORE_KEY]?: PlacesStore };
storeHost[STORE_KEY] ??= {
  cities: [...PLACES.cities],
  areas: [...PLACES.areas],
  categories: [...PLACES.categories],
  services: [...PLACES.services],
  labels: new Map(PLACES.categories.map((category) => [category.slug, category.label])),
};
const store: PlacesStore = storeHost[STORE_KEY];

export const DIRECTORY_CITIES: readonly DirectoryCity[] = store.cities;
export const DIRECTORY_AREAS: readonly DirectoryArea[] = store.areas;
/** Every category a business may be listed in, A–Z. */
export const DIRECTORY_CATEGORIES: readonly DirectoryCategory[] = store.categories;
/** The categories with their own website page: the only ad markets. */
export const AD_CATEGORIES: readonly DirectoryCategory[] = store.services;

/** Puts the lists back to places.json: for tests, which share the process-wide arrays. */
export function resetPlacesToBaseline(): void {
  store.cities.splice(0, store.cities.length, ...PLACES.cities);
  store.areas.splice(0, store.areas.length, ...PLACES.areas);
  store.categories.splice(0, store.categories.length, ...PLACES.categories);
  store.services.splice(0, store.services.length, ...PLACES.services);
  store.labels.clear();
  for (const category of PLACES.categories) store.labels.set(category.slug, category.label);
}

/** The part of the geography catalog this module needs (the shape @brandbasket/db's loadGeoCatalog returns). */
export interface PlacesCatalog {
  readonly districts: readonly { readonly stateCode: string; readonly slug: string; readonly status: "live" | "soon" | "off" }[];
  readonly areas: readonly {
    readonly stateCode: string;
    readonly districtSlug: string;
    readonly slug: string;
    readonly name: string;
    readonly citySlug: string;
    readonly cityName: string;
    readonly status: "on" | "off";
  }[];
  readonly categories: readonly {
    readonly slug: string;
    readonly label: string;
    readonly hasPage: boolean;
    readonly status: "on" | "off";
  }[];
}

/**
 * Replaces the lists with the catalog's. Only the primary district's areas count here (the platform's listing flows are
 * Thane's); an empty result, or a catalog with no areas or categories on, is refused and the lists stay as they were,
 * so an empty or half-filled table can never blank the pickers. Returns whether the catalog was applied.
 */
export function applyPlacesCatalog(catalog: PlacesCatalog): boolean {
  const areas: DirectoryArea[] = [];
  const cityNames = new Map<string, string>();
  for (const area of catalog.areas) {
    if (area.status !== "on" || area.stateCode !== DIRECTORY_STATE.code || area.districtSlug !== DIRECTORY_DISTRICT.slug) continue;
    areas.push({ slug: area.slug, name: area.name, city: area.citySlug });
    if (!cityNames.has(area.citySlug)) cityNames.set(area.citySlug, area.cityName);
  }
  const live = catalog.categories.filter((category) => category.status === "on");
  if (areas.length === 0 || live.length === 0) return false;
  const known = new Map(PLACES.cities.map((city, index) => [city.slug, index]));
  const cities = [...cityNames].map(([slug, name]) => ({ slug, name })).sort((a, b) => {
    const ai = known.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bi = known.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.name.localeCompare(b.name, "en-IN");
  });
  const byLabel = (a: DirectoryCategory, b: DirectoryCategory): number => a.label.localeCompare(b.label, "en-IN");
  const categories = live.map((category) => ({ slug: category.slug, label: category.label })).sort(byLabel);
  const services = live.filter((category) => category.hasPage).map((category) => ({ slug: category.slug, label: category.label })).sort(byLabel);
  areas.sort((a, b) => a.name.localeCompare(b.name, "en-IN"));
  store.cities.splice(0, store.cities.length, ...cities);
  store.areas.splice(0, store.areas.length, ...areas);
  store.categories.splice(0, store.categories.length, ...categories);
  store.services.splice(0, store.services.length, ...services);
  store.labels.clear();
  for (const category of PLACES.categories) store.labels.set(category.slug, category.label);
  for (const category of catalog.categories) store.labels.set(category.slug, category.label);
  return true;
}

/** Where the directory is served. Paths from `listingPath` are appended to this. */
export const DIRECTORY_ORIGIN = "https://fynix.digital";

/**
 * A category's page in one area on the website, /in/<state>/<district>/<area>/<category>. There is no city in the
 * address (2026-10-01): areas are unique across the district.
 */
export function directoryCategoryPath(areaSlug: string, categorySlug: string): string {
  return `/in/${DIRECTORY_STATE.code}/${DIRECTORY_DISTRICT.slug}/${areaSlug}/${categorySlug}`;
}

export function isDirectoryCategory(slug: string): boolean {
  return DIRECTORY_CATEGORIES.some((category) => category.slug === slug);
}

/** Whether the category has its own website page, and so can be an ad market. */
export function isAdCategory(slug: string): boolean {
  return AD_CATEGORIES.some((category) => category.slug === slug);
}

export function isDirectoryCity(slug: string): boolean {
  return DIRECTORY_CITIES.some((city) => city.slug === slug);
}

export function isDirectoryArea(citySlug: string, areaSlug: string): boolean {
  return DIRECTORY_AREAS.some((area) => area.city === citySlug && area.slug === areaSlug);
}

export function cityName(slug: string): string | null {
  return DIRECTORY_CITIES.find((city) => city.slug === slug)?.name ?? null;
}

export function areaName(citySlug: string, areaSlug: string): string | null {
  return DIRECTORY_AREAS.find((area) => area.city === citySlug && area.slug === areaSlug)?.name ?? null;
}

export function categoryLabel(slug: string): string | null {
  return store.labels.get(slug) ?? null;
}

const SLUG_MAX_LENGTH = 80;

/** The combining marks NFKD leaves behind when it splits an accented letter. Written as an escape range. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * "Smile Dental Clinic" -> "smile-dental-clinic". Accents are dropped, "&" reads as "and", anything else that is not a
 * letter or digit becomes a hyphen. Empty when nothing usable is left; the caller asks staff to type one.
 */
export function slugifyBusinessName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
