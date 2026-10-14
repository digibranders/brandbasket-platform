/** A map point, in degrees. */
export interface MapPoint {
  readonly lat: number;
  readonly lon: number;
}

/** India's bounding box, a little generous: a result outside it is a wrong place, not a point to store. */
const INDIA = { south: 6, north: 38, west: 68, east: 98 } as const;

/** One Nominatim result ({ lat, lon } as text) as a point, or null when it is missing or not in India. */
export function parseGeocode(result: { readonly lat: string; readonly lon: string } | undefined): MapPoint | null {
  if (result === undefined) return null;
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < INDIA.south || lat > INDIA.north || lon < INDIA.west || lon > INDIA.east) return null;
  return { lat: Math.round(lat * 100000) / 100000, lon: Math.round(lon * 100000) / 100000 };
}
