import { isIndiaStateCode } from "./india-states";

/*
 * The districts the directory has opened: those with their own areas, category pages and ads (Thane so far). A
 * business in one is listed under one of its areas; anywhere else it gets its own page only, under its state, and its
 * listing key's city part is <state>-<district>, which no opened district's town can be. The implementation lives in
 * @brandbasket/db so the claim writes can check a listing against it (shared depends on db, so db cannot import it from
 * there); @brandbasket/shared re-exports it. Pure and browser-safe.
 */

export interface OpenedDistrict {
  readonly stateCode: string;
  readonly districtSlug: string;
}

/*
 * Districts with areas, category pages and ads. The list starts as Thane alone (the areas in places.json); when the
 * geography catalog is read from the database (GEO_CATALOG_SOURCE=db, @brandbasket/shared geo-catalog-source) it is
 * replaced in place by the catalog's live districts. It lives on globalThis so every bundle's copy of this module
 * sees the one list.
 */
const OPENED_KEY = Symbol.for("brandbasket.openedDistricts");
type OpenedStore = { [OPENED_KEY]?: OpenedDistrict[] };
const openedStore = globalThis as typeof globalThis & OpenedStore;
openedStore[OPENED_KEY] ??= [{ stateCode: "mh", districtSlug: "thane" }];
const opened: OpenedDistrict[] = openedStore[OPENED_KEY];

export const OPENED_DISTRICTS: readonly OpenedDistrict[] = opened;

/** Replaces the opened districts, in place so every reader of OPENED_DISTRICTS sees it. */
export function setOpenedDistricts(districts: readonly OpenedDistrict[]): void {
  opened.splice(0, opened.length, ...districts);
}

export function isOpenedDistrict(stateCode: string, districtSlug: string): boolean {
  return OPENED_DISTRICTS.some((district) => district.stateCode === stateCode && district.districtSlug === districtSlug);
}

/** Whether any opened district is in this state: a business with no PIN of its own must be in one of them. */
export function hasOpenedDistrict(stateCode: string): boolean {
  return OPENED_DISTRICTS.some((district) => district.stateCode === stateCode);
}

/** The listing key's city part for a business outside the opened districts: "wb-north-24-parganas". */
export function elsewhereCitySlug(stateCode: string, districtSlug: string): string {
  return `${stateCode}-${districtSlug}`;
}

/**
 * Whether a listing key's city part is an elsewhere one: a state's code, a hyphen, then the district. No opened
 * district's town starts with a two-letter part, so the two kinds never meet.
 */
export function isElsewhereCitySlug(citySlug: string): boolean {
  const hyphen = citySlug.indexOf("-");
  return hyphen === 2 && citySlug.length > 3 && isIndiaStateCode(citySlug.slice(0, 2));
}
