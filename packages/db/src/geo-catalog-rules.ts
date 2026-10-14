/*
 * The rules for the geography and category catalog (schema/geo-catalog.ts) that need no database: what a slug may be,
 * how a PIN list is read, and the words an address already uses. Pure and browser-safe, so the staff form can show the
 * same message the server would.
 */

export const GEO_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const GEO_SLUG_MAX = 60;
export const GEO_NAME_MAX = 80;
const PIN_PATTERN = /^[1-9][0-9]{5}$/;
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Path words the website already uses next to a district or an area, so no district, area or category may take one:
 * /in/advertise, /in/<state>/business/..., and the pages beside them.
 */
export const GEO_RESERVED_SLUGS: readonly string[] = ["business", "advertise", "in", "api", "search", "admin", "explore", "sitemap"];

/** "Dombivli East" -> "dombivli-east". Accents go, "&" reads as "and". Empty when nothing usable is left. */
export function geoSlugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, GEO_SLUG_MAX)
    .replace(/-+$/g, "");
}

/** What is wrong with a slug, in the words staff read, or null when it can be used. */
export function geoSlugProblem(slug: string): string | null {
  if (slug === "") return "Enter a name for the address.";
  if (slug.length > GEO_SLUG_MAX) return `The address can be at most ${GEO_SLUG_MAX} characters.`;
  if (!GEO_SLUG_PATTERN.test(slug)) return "Use lower-case letters, digits and single hyphens only.";
  if (GEO_RESERVED_SLUGS.includes(slug)) return `"${slug}" is already used by the website. Choose another address.`;
  return null;
}

/** What is wrong with a display name, or null. */
export function geoNameProblem(name: string): string | null {
  if (name.trim() === "") return "Enter a name.";
  if (name.length > GEO_NAME_MAX) return `The name can be at most ${GEO_NAME_MAX} characters.`;
  return null;
}

export interface PinListRead {
  readonly pincodes: readonly string[];
  /** The pieces that are not PIN codes, as typed. */
  readonly invalid: readonly string[];
}

/** "400601, 400 602\n400601" -> ["400601", "400602"]: split on commas, spaces and lines, sorted, repeats dropped. */
export function readPinList(text: string): PinListRead {
  const pieces = text.split(/[,;\s]+/).filter((piece) => piece !== "");
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const piece of pieces) {
    if (PIN_PATTERN.test(piece)) seen.add(piece);
    else invalid.push(piece);
  }
  return { pincodes: [...seen].sort(), invalid };
}

/** Words for a sub-category's name matching: trimmed, lower-cased, one per line or comma, repeats dropped. */
export function readKeywordList(text: string): readonly string[] {
  const seen = new Set<string>();
  for (const piece of text.split(/[,\n]+/)) {
    const word = piece.trim().toLowerCase();
    if (word !== "") seen.add(word);
  }
  return [...seen];
}
