import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase } from "../src/client";
import { isLedgerSourceRef } from "../src/directory-place-ledger";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { isPlaceCitySlug, isPlaceId, isPlaceUrlSlug } from "../src/place-id";
import { backfillDirectoryPlaces } from "../src/queries/directory-place-backfill";
import { importOpenDataPlaces, type OpenDataPlaceRow } from "../src/queries/directory-places";
import { formatBackfillReport } from "./directory-place-backfill-report";

/*
 * Loads the dataset's place ledger (local-directory-data/thane/thane-place-ledger.json) into directory_places, on the
 * staff connection. Safe to run again: places already registered are left alone. Run it after every dataset rebuild,
 * before the website ships the rebuilt listings, so every id on the site exists here first.
 * Then it runs the place_id backfill (backfillDirectoryPlaces, also `pnpm directory:backfill-places` on its own), so
 * rows written by a key that the import just made a legacy key take their place straight away. A backfill refusal
 * (two approved claims on one place, say) leaves the import itself in place: fix what it names and run the backfill.
 *
 *   pnpm directory:import-places <path to thane-place-ledger.json>
 */

const LISTING_KEY = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){3}$/;
const LISTING_KEY_MAX = 200;

class LedgerFormatError extends Error {
  constructor(detail: string) {
    super(`The place ledger is malformed: ${detail}.`);
    this.name = "LedgerFormatError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceRefList(value: unknown): boolean {
  return Array.isArray(value) && value.every((ref: unknown) => typeof ref === "string" && isLedgerSourceRef(ref));
}

/**
 * One ledger entry, `{ id, city, slug, legacyKey?, aka? }`, checked the way the database will check it. `aka` lists
 * the entry's other source refs (a row the dataset build later saw under a second Overture/OSM id). They are
 * deliberately not loaded: matching a row to its entry by any of its refs is the dataset build's job (place_ids.py),
 * and the registry only needs the primary ref, which never changes. They are still checked, so a malformed ledger is
 * refused whole.
 */
function parseEntry(sourceRef: string, value: unknown): OpenDataPlaceRow {
  if (!isLedgerSourceRef(sourceRef)) throw new LedgerFormatError(`bad source ref ${JSON.stringify(sourceRef)}`);
  if (!isRecord(value)) throw new LedgerFormatError(`${sourceRef} is not an object`);
  const { id, city, slug, legacyKey, aka } = value;
  // Open-data ids start with a letter; digit-first ids belong to the platform.
  if (typeof id !== "string" || !isPlaceId(id) || !/^[a-z]/.test(id)) throw new LedgerFormatError(`bad id for ${sourceRef}`);
  if (typeof city !== "string" || !isPlaceCitySlug(city)) throw new LedgerFormatError(`bad city for ${sourceRef}`);
  if (typeof slug !== "string" || !isPlaceUrlSlug(slug)) throw new LedgerFormatError(`bad slug for ${sourceRef}`);
  if (
    legacyKey !== undefined &&
    (typeof legacyKey !== "string" || !LISTING_KEY.test(legacyKey) || legacyKey.length > LISTING_KEY_MAX)
  ) {
    throw new LedgerFormatError(`bad legacyKey for ${sourceRef}`);
  }
  if (aka !== undefined && !isSourceRefList(aka)) throw new LedgerFormatError(`bad aka for ${sourceRef}`);
  return { sourceRef, id, citySlug: city, urlSlug: slug, legacyKey: legacyKey ?? null };
}

function parseLedger(text: string): OpenDataPlaceRow[] {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw)) throw new LedgerFormatError("the top level is not an object of source ref -> entry");
  return Object.entries(raw).map(([sourceRef, value]) => parseEntry(sourceRef, value));
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (file === undefined) throw new Error("Usage: pnpm directory:import-places <path to thane-place-ledger.json>");
  // pnpm runs the script from packages/db; a relative path means relative to where the command was typed.
  const rows = parseLedger(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8"));

  loadLocalEnv();
  // The registry is staff-only (0076): the import runs as firstfold_staff, like the routes that read it.
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    const result = await importOpenDataPlaces(db, rows, new Date());
    console.log(`Directory places: ${result.created} created, ${result.unchanged} unchanged, from ${rows.length} ledger rows.`);
    console.log(formatBackfillReport(await backfillDirectoryPlaces(db, new Date())));
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
