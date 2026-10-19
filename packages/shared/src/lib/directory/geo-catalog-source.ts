import { loadGeoCatalog, setOpenedDistricts, type Database, type GeoCatalogSnapshot } from "@brandbasket/db";
import { applyPlacesCatalog, DIRECTORY_DISTRICT, DIRECTORY_STATE } from "./places";

/*
 * Where the directory's places and categories come from. GEO_CATALOG_SOURCE=db reads the geography catalog (the
 * geo_districts, geo_areas and geo_categories tables, edited in the staff console's Geography page) into the lists in
 * ./places and the opened districts; anything else, the default, leaves places.json in charge. Either way the JSON is
 * the fallback: a table that is empty, half-filled or unreachable never changes the lists, so the live site cannot be
 * blanked by it. The read is cached for a few seconds per process; an edit made in this process applies at once.
 */

export type GeoCatalogSource = "file" | "db";

export function geoCatalogSource(env: Readonly<Record<string, string | undefined>> = process.env): GeoCatalogSource {
  return env.GEO_CATALOG_SOURCE === "db" ? "db" : "file";
}

const REFRESH_MS = 15_000;
const STATE_KEY = Symbol.for("fynix.directory.geoCatalogRefresh");
interface RefreshState {
  loadedAt: number;
  applied: boolean;
  pending: Promise<boolean> | null;
}
const host = globalThis as typeof globalThis & { [STATE_KEY]?: RefreshState };
host[STATE_KEY] ??= { loadedAt: 0, applied: false, pending: null };
const state: RefreshState = host[STATE_KEY];

/** Applies a snapshot to the places lists and the opened districts. Returns whether it was applied. */
export function applyGeoCatalog(snapshot: GeoCatalogSnapshot): boolean {
  if (!applyPlacesCatalog(snapshot)) return false;
  const primary = snapshot.districts.find((district) => district.stateCode === DIRECTORY_STATE.code && district.slug === DIRECTORY_DISTRICT.slug);
  setOpenedDistricts(primary?.status === "live" ? [{ stateCode: primary.stateCode, districtSlug: primary.slug }] : []);
  return true;
}

/**
 * Reads the catalog into this process when the source is the database and the last read is older than a few seconds.
 * Never throws: a failed read logs and leaves the lists as they were. Returns whether the catalog is in use.
 */
export async function refreshGeoCatalog(db: Database, options: { readonly force?: boolean; readonly now?: number } = {}): Promise<boolean> {
  if (geoCatalogSource() !== "db") return false;
  const now = options.now ?? Date.now();
  if (state.pending !== null) return state.pending;
  if (options.force !== true && state.loadedAt !== 0 && now - state.loadedAt < REFRESH_MS) return state.applied;
  state.pending = (async () => {
    try {
      state.applied = applyGeoCatalog(await loadGeoCatalog(db));
      state.loadedAt = now;
      return state.applied;
    } catch (error) {
      console.error("The geography catalog could not be read; the built-in lists stay in use.", error);
      return false;
    } finally {
      state.pending = null;
    }
  })();
  return state.pending;
}
