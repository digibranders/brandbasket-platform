/** Parses the staff Listing form on the admin client page. Server-only: the business id check comes from ./place-id. */
import type { ListingPlacementInput } from "@brandbasket/db";
import { textField, type FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";
import { isPlaceId } from "./place-id";
import { DIRECTORY_STATE, isDirectoryArea, isDirectoryCategory, isDirectoryCity } from "./places";

/** A generous box around Thane district. A pin outside it is a pasting mistake (lat/lon swapped, another city). */
const DISTRICT_BOUNDS = { south: 18.85, north: 19.95, west: 72.7, east: 73.8 } as const;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const E164 = /^\+[0-9]{8,15}$/;
const MAX_BOOKING_URL_LENGTH = 2048;
const SOURCE_PATH = /^\/in\/[a-z0-9/-]+$/;

export const PLACEMENT_FIELDS = [
  "category",
  "city",
  "area",
  "slug",
  "lat",
  "lon",
  "pinLabel",
  "whatsappPhone",
  "bookingUrl",
  "replacesSourcePath",
  "takeOverPlaceId",
] as const;
export type PlacementField = (typeof PLACEMENT_FIELDS)[number];

export const PLACEMENT_FIELD_MESSAGES: Readonly<Record<PlacementField, string>> = {
  category: "Choose a category from the list.",
  city: "Choose a city from the list.",
  area: "Choose an area in that city.",
  slug: "Use lowercase letters, digits and single hyphens, up to 80 characters.",
  lat: "Paste a latitude inside Thane, like 19.19.",
  lon: "Paste a longitude inside Thane, like 72.97.",
  pinLabel: "Describe the pin in up to 120 characters.",
  whatsappPhone: "Use a full number with country code, like +91 90000 00000, or leave it empty.",
  bookingUrl: "Use an https:// address, or leave it empty.",
  replacesSourcePath: "Paste the unconfirmed listing's /in/... address, or leave it empty.",
  takeOverPlaceId: "Paste the business's 7-character ID or its temporary address, or leave it empty.",
};

export function isPlacementField(value: string): value is PlacementField {
  return (PLACEMENT_FIELDS as readonly string[]).includes(value);
}

interface PlacementProblem {
  readonly success: false;
  readonly field: PlacementField;
  readonly message: string;
}

function problem(field: PlacementField): PlacementProblem {
  return { success: false, field, message: PLACEMENT_FIELD_MESSAGES[field] };
}

function coordinate(raw: string, min: number, max: number): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Empty is null; an https address is stored in URL.href form (lowercase host, quotes and spaces encoded). */
function bookingAddress(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.href.length > MAX_BOOKING_URL_LENGTH) return undefined;
  return url.href;
}

/** Accepts a bare path or a full brandbasket.in URL; keeps only the path. */
function sourcePath(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return undefined;
    }
  }
  path = path.replace(/\/+$/, "");
  return SOURCE_PATH.test(path) ? path : undefined;
}

/**
 * The business id at the end of an older business address, /in/<state>/<city>/business/<name>/<id>. Today's address
 * ends in a URL code instead; the staff console reads one as its id before this form is parsed (page-address.ts).
 */
const BUSINESS_ADDRESS_ID = /^\/in\/[a-z]{2}\/[a-z0-9-]+\/business\/[a-z0-9-]+\/([^/]+)$/;

/** Empty is null; else a place id, typed as itself or as the end of the business's address (full URL or path). */
function placeIdOf(raw: string): string | null | undefined {
  // Ids are lowercase; one read out or typed from a poster may not be.
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return null;
  if (isPlaceId(trimmed)) return trimmed;
  const path = sourcePath(trimmed);
  const id = path === null || path === undefined ? undefined : BUSINESS_ADDRESS_ID.exec(path)?.[1];
  return id !== undefined && isPlaceId(id) ? id : undefined;
}

export function parsePlacementForm(formData: FormData): FormParseResult<ListingPlacementInput> {
  const categorySlug = textField(formData, "category").trim();
  if (!isDirectoryCategory(categorySlug)) return problem("category");

  const citySlug = textField(formData, "city").trim();
  if (!isDirectoryCity(citySlug)) return problem("city");

  const areaSlug = textField(formData, "area").trim();
  if (!isDirectoryArea(citySlug, areaSlug)) return problem("area");

  const slug = textField(formData, "slug").trim();
  if (!SLUG.test(slug) || slug.length > 80) return problem("slug");

  const lat = coordinate(textField(formData, "lat"), DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.north);
  if (lat === null) return problem("lat");
  const lon = coordinate(textField(formData, "lon"), DISTRICT_BOUNDS.west, DISTRICT_BOUNDS.east);
  if (lon === null) return problem("lon");

  const pinLabel = cleanLine(textField(formData, "pinLabel"));
  if (pinLabel.length < 1 || pinLabel.length > 120) return problem("pinLabel");

  const rawPhone = textField(formData, "whatsappPhone").replace(/[\s-]/g, "");
  if (rawPhone !== "" && !E164.test(rawPhone)) return problem("whatsappPhone");

  const bookingUrl = bookingAddress(textField(formData, "bookingUrl"));
  if (bookingUrl === undefined) return problem("bookingUrl");

  const replacesSourcePath = sourcePath(textField(formData, "replacesSourcePath"));
  if (replacesSourcePath === undefined) return problem("replacesSourcePath");

  const takeOverPlaceId = placeIdOf(textField(formData, "takeOverPlaceId"));
  if (takeOverPlaceId === undefined) return problem("takeOverPlaceId");

  return {
    success: true,
    data: {
      categorySlug,
      stateCode: DIRECTORY_STATE.code,
      citySlug,
      areaSlug,
      slug,
      lat,
      lon,
      pinLabel,
      whatsappPhone: rawPhone === "" ? null : rawPhone,
      bookingUrl,
      replacesSourcePath,
      takeOverPlaceId,
    },
  };
}
