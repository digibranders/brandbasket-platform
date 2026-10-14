import { isPlaceId } from "./place-id";
import type { OpenListingSource } from "./schema/directory-open-listings";

/*
 * The dataset build's output, as the website reads it today (website-listing/content/local):
 * - thane-listings.json: [name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug] per
 *   business (local-directory-data/thane/build_web_data.py). urlCity and urlSlug are the URL label, which
 *   directory_places owns, so they are read past and not stored again.
 * - thane-site-phones.json: { id: [e164, foundOn (page URL or "call"), checkedOn YYYY-MM-DD, whatsapp] }
 *   (build_site_phones.py).
 * Checked the way the database checks them, so a bad file is refused whole before anything is written.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PHONE = /^\+91[1-9][0-9]{9}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: readonly OpenListingSource[] = ["osm", "overture", "survey"];

export class DirectoryFileError extends Error {
  constructor(detail: string) {
    super(`The directory data file is malformed: ${detail}.`);
    this.name = "DirectoryFileError";
  }
}

export interface ListingFileRow {
  readonly placeId: string;
  readonly name: string;
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  readonly website: string;
  readonly source: OpenListingSource;
}

export interface ListingPhone {
  readonly e164: string;
  /** The page the number was found on, or "call". */
  readonly foundOn: string;
  readonly checkedOn: string;
  readonly whatsapp: boolean;
}

export interface OpenListingInput extends ListingFileRow {
  readonly phone: ListingPhone | null;
}

function isSource(value: unknown): value is OpenListingSource {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

/** The page the number was found on (http or https), or "call" for a survey call. */
function isFoundOn(value: unknown): value is string {
  return typeof value === "string" && (value === "call" || /^https?:\/\//.test(value));
}

function slug(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw new DirectoryFileError(`${where}: bad ${field}`);
  return value;
}

function finite(value: unknown, field: string, where: string, limit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new DirectoryFileError(`${where}: bad ${field}`);
  }
  return value;
}

function parseRow(value: unknown, index: number): ListingFileRow {
  const where = `row ${index}`;
  if (!Array.isArray(value) || value.length !== 12) throw new DirectoryFileError(`${where} is not a 12-item row`);
  const [name, category, city, area, address, lat, lon, website, source, id] = value as unknown[];
  if (typeof name !== "string" || name.length === 0 || name.length > 200) throw new DirectoryFileError(`${where}: bad name`);
  if (typeof address !== "string") throw new DirectoryFileError(`${where}: bad address`);
  if (typeof website !== "string") throw new DirectoryFileError(`${where}: bad website`);
  if (!isSource(source)) throw new DirectoryFileError(`${where}: bad source ${JSON.stringify(source)}`);
  if (typeof id !== "string" || !isPlaceId(id)) throw new DirectoryFileError(`${where}: bad place id`);
  return {
    placeId: id,
    name,
    categorySlug: slug(category, "category", where),
    citySlug: slug(city, "city", where),
    areaSlug: slug(area, "area", where),
    address,
    lat: finite(lat, "lat", where, 90),
    lon: finite(lon, "lon", where, 180),
    website,
    source,
  };
}

export function parseListingsFile(text: string): ListingFileRow[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new DirectoryFileError("the listings file is not an array of rows");
  if (raw.length === 0) throw new DirectoryFileError("the listings file has no rows");
  const rows = raw.map(parseRow);
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.placeId)) throw new DirectoryFileError(`place id ${row.placeId} appears twice`);
    seen.add(row.placeId);
  }
  return rows;
}

export function parsePhonesFile(text: string): ReadonlyMap<string, ListingPhone> {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DirectoryFileError("the phones file is not an object of place id -> entry");
  }
  const phones = new Map<string, ListingPhone>();
  for (const [id, entry] of Object.entries(raw)) {
    if (!isPlaceId(id) || !Array.isArray(entry) || entry.length !== 4) throw new DirectoryFileError(`bad phone entry ${id}`);
    const [e164, foundOn, checkedOn, whatsapp] = entry as unknown[];
    if (
      typeof e164 !== "string" ||
      !PHONE.test(e164) ||
      !isFoundOn(foundOn) ||
      typeof checkedOn !== "string" ||
      !DAY.test(checkedOn) ||
      typeof whatsapp !== "boolean"
    ) {
      throw new DirectoryFileError(`bad phone entry ${id}`);
    }
    phones.set(id, { e164, foundOn, checkedOn, whatsapp });
  }
  return phones;
}

/** Each listing with its shown phone. A phone for a business the listings file lacks means the two files disagree. */
export function toListingInputs(
  rows: readonly ListingFileRow[],
  phones: ReadonlyMap<string, ListingPhone>,
): OpenListingInput[] {
  const ids = new Set(rows.map((row) => row.placeId));
  for (const id of phones.keys()) {
    if (!ids.has(id)) throw new DirectoryFileError(`the phones file has ${id}, which the listings file does not`);
  }
  return rows.map((row) => ({ ...row, phone: phones.get(row.placeId) ?? null }));
}

/**
 * Splits the phones file into the numbers for businesses the listings file has, and the place ids of the rest. A
 * dataset rebuild can drop a business (a category leaving the taxonomy) while the phone check still holds its number;
 * the website never shows such a number, since it looks phones up by listing. The import drops them and says how many.
 */
export function dropUnlistedPhones(
  rows: readonly ListingFileRow[],
  phones: ReadonlyMap<string, ListingPhone>,
): { readonly listed: ReadonlyMap<string, ListingPhone>; readonly dropped: readonly string[] } {
  const ids = new Set(rows.map((row) => row.placeId));
  const listed = new Map<string, ListingPhone>();
  const dropped: string[] = [];
  for (const [id, phone] of phones) {
    if (ids.has(id)) listed.set(id, phone);
    else dropped.push(id);
  }
  return { listed, dropped };
}
