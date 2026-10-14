import type { GeoAdminArea, GeoAdminCategory, GeoAdminDistrict } from "@firstfold/db";

/*
 * The Geography page's tabs and filters, read from the address and applied to the catalog. Pure.
 */

export const GEOGRAPHY_TABS = ["districts", "areas", "categories"] as const;
export type GeographyTab = (typeof GEOGRAPHY_TABS)[number];

export interface GeographyView {
  readonly tab: GeographyTab;
  /** What was typed in the search box. */
  readonly query: string;
  /** The district an Areas list is for, as "mh/thane", or "" for the first one that has areas. */
  readonly district: string;
  /** Only rows that are switched off or still drafts. */
  readonly offOnly: boolean;
  /** A parent category's address: only it and its sub-categories. "" for all. */
  readonly group: string;
  /** Which page of the list, from 1. */
  readonly page: number;
}

/** Rows on one page: sized so a list fits the screen without scrolling. */
export const PAGE_SIZE = 7;

type Params = Readonly<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseGeographyView(params: Params): GeographyView {
  const tab = first(params.tab);
  return {
    tab: (GEOGRAPHY_TABS as readonly string[]).includes(tab) ? (tab as GeographyTab) : "districts",
    query: first(params.q).trim().slice(0, 80),
    district: first(params.district).trim().slice(0, 40),
    group: first(params.group).trim().slice(0, 80),
    offOnly: first(params.show) === "off",
    page: Math.min(Math.max(Math.trunc(Number(first(params.page))) || 1, 1), 1000),
  };
}

export function geographyHref(view: Partial<GeographyView>): string {
  const query = new URLSearchParams();
  if (view.tab !== undefined && view.tab !== "districts") query.set("tab", view.tab);
  if (view.query !== undefined && view.query !== "") query.set("q", view.query);
  if (view.district !== undefined && view.district !== "") query.set("district", view.district);
  if (view.group !== undefined && view.group !== "") query.set("group", view.group);
  if (view.offOnly === true) query.set("show", "off");
  if (view.page !== undefined && view.page > 1) query.set("page", String(view.page));
  const text = query.toString();
  return text === "" ? "/geography" : `/geography?${text}`;
}

function matches(query: string, ...fields: readonly (string | null)[]): boolean {
  if (query === "") return true;
  const needle = query.toLowerCase();
  return fields.some((field) => field !== null && field.toLowerCase().includes(needle));
}

export function filterDistricts(districts: readonly GeoAdminDistrict[], view: GeographyView): readonly GeoAdminDistrict[] {
  return districts.filter(
    (district) => matches(view.query, district.name, district.slug, district.stateCode) && (!view.offOnly || district.status === "off" || !district.slugLocked),
  );
}

/** A district as the Areas tab names it in the address: "mh/thane". */
export function districtKeyOf(district: { readonly stateCode: string; readonly slug: string }): string {
  return `${district.stateCode}/${district.slug}`;
}

export function filterAreas(areas: readonly GeoAdminArea[], view: GeographyView, districtKey: string): readonly GeoAdminArea[] {
  return areas.filter(
    (area) =>
      `${area.stateCode}/${area.districtSlug}` === districtKey &&
      matches(view.query, area.name, area.slug, area.cityName, ...area.pincodes) &&
      (!view.offOnly || area.status === "off" || !area.slugLocked),
  );
}

export function filterCategories(categories: readonly GeoAdminCategory[], view: GeographyView): readonly GeoAdminCategory[] {
  return categories.filter(
    (category) =>
      (view.group === "" || category.slug === view.group || category.parentSlug === view.group) &&
      matches(view.query, category.label, category.singular, category.slug, category.parentSlug) &&
      (!view.offOnly || category.status === "off" || !category.slugLocked),
  );
}

export interface Paged<T> {
  readonly rows: readonly T[];
  /** The page actually shown, kept inside the list when the address asks for one past the end. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export function paginate<T>(items: readonly T[], page: number): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const shown = Math.min(page, pageCount);
  return { rows: items.slice((shown - 1) * PAGE_SIZE, shown * PAGE_SIZE), page: shown, pageCount, total: items.length };
}
