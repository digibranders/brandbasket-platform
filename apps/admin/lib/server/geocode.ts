import "server-only";
import { z } from "zod";
import { parseGeocode, type MapPoint } from "@/lib/geocode";

/*
 * Finds the map point of an area from its name, town and PIN codes, for the Geography page, using OpenStreetMap's
 * Nominatim search (no key; its policy allows light use with an identifying User-Agent, and the staff console adds an
 * area now and then). Only the area's own place names are sent, never anything about a person. Any failure is a null:
 * the staff member can type a point, and until then the website uses the middle of the town.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 6000;
const USER_AGENT = "Staff console (geography page)";

const resultsSchema = z.array(z.object({ lat: z.string(), lon: z.string() }));

async function search(params: Readonly<Record<string, string>>, fetcher: typeof fetch): Promise<MapPoint | null> {
  const url = new URL(ENDPOINT);
  for (const [key, value] of Object.entries({ format: "jsonv2", limit: "1", countrycodes: "in", ...params })) url.searchParams.set(key, value);
  try {
    const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return null;
    const parsed = resultsSchema.safeParse(await response.json());
    return parsed.success ? parseGeocode(parsed.data[0]) : null;
  } catch {
    return null;
  }
}

export interface AreaToLocate {
  readonly name: string;
  readonly town: string;
  readonly stateName: string;
  readonly pincodes: readonly string[];
}

/** The area's point: its name with its town first, then its first PIN code alone. Null when neither is found. */
export async function locateArea(area: AreaToLocate, fetcher: typeof fetch = fetch): Promise<MapPoint | null> {
  const byName = await search({ q: `${area.name}, ${area.town}, ${area.stateName}, India` }, fetcher);
  if (byName !== null) return byName;
  const pin = area.pincodes[0];
  return pin === undefined ? null : search({ postalcode: pin }, fetcher);
}
