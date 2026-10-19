import {
  DIRECTORY_AREAS,
  DIRECTORY_CITIES,
  DIRECTORY_ORIGIN,
  DIRECTORY_STATE,
  isDirectoryArea,
  isDirectoryCategory,
} from "@brandbasket/shared/lib/directory/places";
import { categoryOptions, type PickOption } from "@/lib/listing-address";
import { OWNER_FORM_FIELDS_MESSAGE, ownerFormCheck } from "@/lib/owner-form";

/*
 * The Listing tab of the Business profile (docs/superpowers/specs/2026-10-01-business-profile-design.md): where the
 * business is listed, asked as district, then area, then category, the order of the directory's addresses
 * (/in/mh/{district}/{area}/{category}). Browser-safe and pure: the form shows the address fill in, and the action
 * checks the same picks.
 *
 * The district is Thane only for now, and no PIN code is asked. An area's slug is unique across the district, so the
 * area also says which town it is in, which the listing key (<category>/<city>/<area>/<name>) still carries.
 */

export interface DirectoryDistrict {
  readonly slug: string;
  readonly name: string;
}

/** The districts an owner can list in. Every area in the directory's places is in Thane district. */
export const DIRECTORY_DISTRICTS: readonly DirectoryDistrict[] = [{ slug: "thane", name: "Thane" }];

export const BUSINESS_LISTING_FIELDS = ["district", "area", "category"] as const;
export type BusinessListingField = (typeof BUSINESS_LISTING_FIELDS)[number];

const isListingForm = ownerFormCheck(BUSINESS_LISTING_FIELDS);

export function isDirectoryDistrict(slug: string): boolean {
  return DIRECTORY_DISTRICTS.some((district) => district.slug === slug);
}

export function districtName(slug: string): string | null {
  return DIRECTORY_DISTRICTS.find((district) => district.slug === slug)?.name ?? null;
}

/** The town an area is in, or null for a slug the directory does not have. */
export function cityOfArea(areaSlug: string): string | null {
  return DIRECTORY_AREAS.find((area) => area.slug === areaSlug)?.city ?? null;
}

/** Every area in the district, A to Z, each with its town: "Naupada · Thane". */
export function districtAreaOptions(districtSlug: string | null): readonly PickOption[] {
  if (districtSlug === null || !isDirectoryDistrict(districtSlug)) return [];
  const towns = new Map(DIRECTORY_CITIES.map((city) => [city.slug, city.name]));
  return DIRECTORY_AREAS.map((area) => ({ value: area.slug, label: `${area.name} · ${towns.get(area.city) ?? area.city}` })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

/** Every category, A to Z. */
export function listingCategoryOptions(): readonly PickOption[] {
  return categoryOptions();
}

/** What the Listing tab's pick lists offer: each district's areas by its slug, and every category. */
export interface ListingFormOptions {
  readonly areasByDistrict: Readonly<Record<string, readonly PickOption[]>>;
  readonly categories: readonly PickOption[];
}

/**
 * The Listing tab's pick lists as they are now. The form is a client component, and the places it would import there are
 * the copies bundled into the browser, which the geography catalog never reaches: the server page reads them here, after
 * the catalog is applied, and hands them down.
 */
export function listingFormOptions(): ListingFormOptions {
  return {
    areasByDistrict: Object.fromEntries(DIRECTORY_DISTRICTS.map((district) => [district.slug, districtAreaOptions(district.slug)])),
    categories: listingCategoryOptions(),
  };
}

export type ListedAtPart = "fixed" | "district" | "area" | "category";

/** One part of the address between slashes. Until a part is chosen its text is a placeholder word. */
export interface ListedAtSegment {
  readonly part: ListedAtPart;
  readonly text: string;
  readonly chosen: boolean;
}

/** The directory's host as an address is written, without the scheme. */
export const LISTED_AT_HOST = new URL(DIRECTORY_ORIGIN).host;

function segment(part: Exclude<ListedAtPart, "fixed">, slug: string | null, placeholder: string): ListedAtSegment {
  return slug === null || slug === "" ? { part, text: placeholder, chosen: false } : { part, text: slug, chosen: true };
}

/** `/in/mh/<district>/<area>/<category>`, part by part: the directory page the business is listed on. */
export function listedAtAddress(picks: {
  readonly districtSlug: string | null;
  readonly areaSlug: string | null;
  readonly categorySlug: string | null;
}): readonly ListedAtSegment[] {
  return [
    { part: "fixed", text: "in", chosen: true },
    { part: "fixed", text: DIRECTORY_STATE.code, chosen: true },
    segment("district", picks.districtSlug, "district"),
    segment("area", picks.areaSlug, "area"),
    segment("category", picks.categorySlug, "category"),
  ];
}

/**
 * What the server saves: an area of the opened district with its town, or (for the businesses already listed by PIN
 * code) a locality of its PIN. This form only ever sends an area, with no PIN.
 */
export type BusinessListingInput =
  | {
      readonly pincode: string | null;
      readonly place: { readonly kind: "area"; readonly citySlug: string; readonly areaSlug: string };
      readonly categorySlug: string;
    }
  | {
      readonly pincode: string;
      readonly place: { readonly kind: "locality"; readonly localitySlug: string };
      readonly categorySlug: string;
    };

export type BusinessListingParseResult =
  | { readonly success: true; readonly data: BusinessListingInput }
  | { readonly success: false; readonly field: BusinessListingField | null; readonly message: string };

/**
 * Why the server would not save the Listing tab (lib/server/business-profile.ts): `pin`, India Post has no such PIN;
 * `place`, the area picked is not in it. Neither happens for a form with no PIN, but the server still checks.
 */
export type ListingRefusalReason = "no-details" | "pin" | "place" | "locked" | "refused";

/** The question a refusal is about, or null for one about the listing as a whole. */
export function listingRefusalField(reason: ListingRefusalReason): BusinessListingField | null {
  switch (reason) {
    case "place":
      return "area";
    case "pin":
    case "no-details":
    case "locked":
    case "refused":
      return null;
  }
}

/** The form keeps its own picks, so a refusal carries only what went wrong and where. */
export type BusinessListingFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly field: BusinessListingField | null; readonly message: string };

export const initialBusinessListingFormState: BusinessListingFormState = { status: "idle" };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseBusinessListingForm(formData: FormData): BusinessListingParseResult {
  if (!isListingForm(formData)) return { success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE };

  if (!isDirectoryDistrict(textValue(formData, "district"))) return { success: false, field: "district", message: "Choose your district." };

  const areaSlug = textValue(formData, "area");
  const citySlug = cityOfArea(areaSlug);
  if (citySlug === null || !isDirectoryArea(citySlug, areaSlug)) return { success: false, field: "area", message: "Choose your area." };

  const categorySlug = textValue(formData, "category");
  if (!isDirectoryCategory(categorySlug)) return { success: false, field: "category", message: "Choose your business category." };

  return { success: true, data: { pincode: null, place: { kind: "area", citySlug, areaSlug }, categorySlug } };
}
