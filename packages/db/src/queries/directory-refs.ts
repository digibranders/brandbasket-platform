import { and, eq, getTableName, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import { directoryPlaceLegacyKeys } from "../schema";
import type { ScopedTransaction } from "../scope";
import { findPlaces, resolveLegacyKeys } from "./directory-places";

type Runner = Database | ScopedTransaction;

/*
 * How the directory names a business while the website moves from listing keys to place ids (Task 7 of
 * docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). A business the registry knows is written by its
 * place id, and read by it together with its rows written by one of its legacy keys before the backfill reached them
 * (so nothing vanishes between the import and the backfill); a key the registry does not know (an address no place
 * has, or any key before the dataset's places are imported) is read and written by the key alone, as before ids. Keys,
 * and with them the unplaced and legacy-key paths, go in the contract step (Task 13).
 */

/**
 * One business, as a write names it. With a place, `listingKey` is the address the request came by (kept on the row,
 * so the platform before ids can still read it), or null for a request by id.
 */
export type DirectoryRef =
  | { readonly placeId: string; readonly listingKey: string | null }
  | { readonly placeId: null; readonly listingKey: string };

/** Many businesses, as a read names them: place ids, and the keys no place has. */
export interface DirectoryLookup {
  readonly placeIds: readonly string[];
  readonly unplacedKeys: readonly string[];
}

/** What a request names one business by: its place id, or (during the switch) its listing key. */
export type DirectoryNamed = { readonly by: "id"; readonly id: string } | { readonly by: "key"; readonly key: string };

/** What a request names many businesses by: already checked to be ids and keys. */
export interface DirectoryAsk {
  readonly ids: readonly string[];
  readonly keys: readonly string[];
}

export interface ResolvedDirectoryAsk {
  readonly lookup: DirectoryLookup;
  /** Each asked id or key, and the id or key its business's rows are read under (see directoryRefId). */
  readonly readAs: ReadonlyMap<string, string>;
}

/** A directory row with neither a place nor a listing key; every table's `_business_check` forbids it. */
export class DirectoryRowWithoutBusinessError extends Error {
  constructor(table: string) {
    super(`A ${table} row names no directory business: it has neither a place_id nor a listing_key.`);
    this.name = "DirectoryRowWithoutBusinessError";
  }
}

/**
 * The id a business's rows are read under: its place id, or for a key no place has, the key. The two can never
 * collide: a key has slashes and an id has none.
 */
export function directoryRefId(ref: DirectoryRef): string {
  return ref.placeId ?? ref.listingKey;
}

/** The business a row that always has a listing key (a claim, a bid) names: its place when it has one. */
export function directoryRefOf(row: { readonly placeId: string | null; readonly listingKey: string }): DirectoryRef {
  return row.placeId === null ? { placeId: null, listingKey: row.listingKey } : { placeId: row.placeId, listingKey: row.listingKey };
}

/** The businesses `refs` name, each once. */
export function directoryLookupOf(refs: readonly DirectoryRef[]): DirectoryLookup {
  const placeIds = new Set<string>();
  const unplacedKeys = new Set<string>();
  for (const ref of refs) {
    if (ref.placeId === null) unplacedKeys.add(ref.listingKey);
    else placeIds.add(ref.placeId);
  }
  return { placeIds: [...placeIds], unplacedKeys: [...unplacedKeys] };
}

/** How many businesses a lookup names. */
export function directoryLookupSize(lookup: DirectoryLookup): number {
  return new Set(lookup.placeIds).size + new Set(lookup.unplacedKeys).size;
}

export function isEmptyDirectoryLookup(lookup: DirectoryLookup): boolean {
  return lookup.placeIds.length === 0 && lookup.unplacedKeys.length === 0;
}

/** The columns a table names its business by. */
export interface DirectoryBusinessColumns {
  readonly placeId: AnyPgColumn;
  readonly listingKey: AnyPgColumn;
}

/**
 * A place's rows: those with its place_id, and those written by one of its legacy keys before the backfill gave them a
 * place (between the import and the backfill, or by a platform from before ids). Without the second half, everything a
 * place had would vanish from the website until the backfill ran.
 */
function ofPlaces(columns: DirectoryBusinessColumns, placeIds: readonly string[]): SQL {
  const ids = sql.param([...new Set(placeIds)]);
  return sql`(${columns.placeId} = any(${ids}::text[]) or (${columns.placeId} is null and ${columns.listingKey} in (select k.listing_key from ${directoryPlaceLegacyKeys} k where k.place_id = any(${ids}::text[]))))`;
}

/**
 * The business a stored row is about, as reads key it: its place, else the place its listing key is a legacy key of
 * (a row the backfill has not reached yet), else its listing key. Matches what matchesDirectoryLookup finds.
 */
export function directoryBusinessOf(columns: DirectoryBusinessColumns): SQL<string> {
  // Qualified by hand: a selected column renders unqualified, and inside the subquery would bind to k.listing_key.
  const listingKey = qualified(columns.listingKey);
  return sql<string>`coalesce(${qualified(columns.placeId)}, (select k.place_id from ${directoryPlaceLegacyKeys} k where k.listing_key = ${listingKey}), ${listingKey})`;
}

/**
 * `"table"."column"`, however the surrounding query would render the column. It always names the table by its own name,
 * so a caller of directoryBusinessOf must not alias the table (`alias(directoryClaims, "c")` or `from directory_claims
 * c`): the column would then name a table the query does not have under that name, and Postgres refuses the query (or,
 * with the table joined twice, it binds to the other copy).
 */
function qualified(column: AnyPgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/**
 * Rows of the businesses `lookup` names: a place's (ofPlaces), or, for a key no place has, the rows with that key and
 * no place. Key the rows by directoryBusinessOf. Callers return early on an empty lookup.
 */
export function matchesDirectoryLookup(columns: DirectoryBusinessColumns, lookup: DirectoryLookup): SQL {
  const placed = lookup.placeIds.length === 0 ? undefined : ofPlaces(columns, lookup.placeIds);
  const unplaced =
    lookup.unplacedKeys.length === 0 ? undefined : and(isNull(columns.placeId), inArray(columns.listingKey, [...new Set(lookup.unplacedKeys)]));
  return or(placed, unplaced) ?? sql`false`;
}

/** Rows of one business: a place's (ofPlaces), or, for a key no place has, the rows with that key and no place. */
export function matchesDirectoryRef(columns: DirectoryBusinessColumns, ref: DirectoryRef): SQL {
  if (ref.placeId !== null) return ofPlaces(columns, [ref.placeId]);
  return and(isNull(columns.placeId), eq(columns.listingKey, ref.listingKey)) ?? sql`false`;
}

/**
 * Whether two rows are about the same business: the same place, or, when neither has one, the same listing key. A row
 * with a place and one without are not known to be the same: the backfill gives every row of a key its place at once.
 */
export function sameDirectoryBusiness(
  a: { readonly placeId: string | null; readonly listingKey: string | null },
  b: { readonly placeId: string | null; readonly listingKey: string | null },
): boolean {
  if (a.placeId !== null || b.placeId !== null) return a.placeId === b.placeId;
  return a.listingKey !== null && a.listingKey === b.listingKey;
}

/**
 * What a read asks about, as businesses: ids as themselves (an unknown id simply has no rows), each key as the place
 * it is a legacy key of, or on its own when no place has it. Staff connection: the place registry is staff-only.
 */
export async function resolveDirectoryAsk(db: Runner, ask: DirectoryAsk): Promise<ResolvedDirectoryAsk> {
  const places = await resolveLegacyKeys(db, ask.keys);
  const readAs = new Map<string, string>();
  const placeIds = new Set<string>();
  const unplacedKeys = new Set<string>();
  for (const id of ask.ids) {
    readAs.set(id, id);
    placeIds.add(id);
  }
  for (const key of ask.keys) {
    const placeId = places.get(key);
    readAs.set(key, placeId ?? key);
    if (placeId === undefined) unplacedKeys.add(key);
    else placeIds.add(placeId);
  }
  return { lookup: { placeIds: [...placeIds], unplacedKeys: [...unplacedKeys] }, readAs };
}

/** Each asked id or key with the answer read for its business; those whose business had none are left out. */
export function answerByAsked<T>(resolved: ResolvedDirectoryAsk, results: ReadonlyMap<string, T>): Map<string, T> {
  const answers = new Map<string, T>();
  for (const [asked, readAs] of resolved.readAs) {
    const result = results.get(readAs);
    if (result !== undefined) answers.set(asked, result);
  }
  return answers;
}

/**
 * The business a write names: an id only when that place exists (null otherwise, so the caller can refuse it rather
 * than meet the foreign key), a key as its place, kept alongside, or on its own when no place has it. Staff connection.
 */
export async function resolveDirectoryNamed(db: Runner, named: DirectoryNamed): Promise<DirectoryRef | null> {
  if (named.by === "id") return (await findPlaces(db, [named.id])).has(named.id) ? { placeId: named.id, listingKey: null } : null;
  return resolveListingKey(db, named.key);
}

/** The business a read names: an id as itself (an id no place has simply has no rows), a key as for a write. */
export async function resolveDirectoryNamedForRead(db: Runner, named: DirectoryNamed): Promise<DirectoryRef> {
  return named.by === "id" ? { placeId: named.id, listingKey: null } : resolveListingKey(db, named.key);
}

/** A listing key as the business it names: its place, with the key kept alongside, or the key alone. */
export async function resolveListingKey(db: Runner, listingKey: string): Promise<DirectoryRef> {
  const placeId = (await resolveLegacyKeys(db, [listingKey])).get(listingKey);
  return placeId === undefined ? { placeId: null, listingKey } : { placeId, listingKey };
}
