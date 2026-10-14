import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ListingPhone, OpenListingInput } from "../directory-listing-file";
import { directoryOpenListings, directoryPlaces } from "../schema";

/** Rows per INSERT and per place-existence check: well under Postgres's 65,535 bind parameters (15 per row). */
const BATCH_SIZE = 500;

export interface OpenListingSyncResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Businesses that were visible and are no longer in the dataset. */
  readonly hidden: number;
}

/** A visible listing with its URL label, as the website needs it. */
export interface VisibleOpenListing extends OpenListingInput {
  readonly urlCitySlug: string;
  readonly urlSlug: string;
}

/** The dataset has listings whose place id directory_places doesn't know: run `pnpm directory:import-places` first. */
export class UnknownListingPlaceError extends Error {
  constructor(readonly placeIds: readonly string[]) {
    super(
      `${placeIds.length} listings have no registered place (first: ${placeIds.slice(0, 10).join(", ")}). ` +
        "Run `pnpm directory:import-places` with the same build's ledger first.",
    );
    this.name = "UnknownListingPlaceError";
  }
}

export class DuplicateListingError extends Error {
  constructor(readonly placeId: string) {
    super(`Listing ${placeId} appears twice in one import.`);
    this.name = "DuplicateListingError";
  }
}

/** A build may hide at most this share of the visible listings, or MASS_HIDE_MIN rows, whichever is more. */
export const MASS_HIDE_SHARE = 0.05;
export const MASS_HIDE_MIN = 10;

export interface SyncOptions {
  /** Lets a build hide more than the mass-hide limit, or hide everything with an empty build. */
  readonly allowMassHide?: boolean;
}

/** The build would hide far more of the directory than a normal rebuild does: probably a truncated or wrong file. */
export class MassHideRefusedError extends Error {
  constructor(
    readonly wouldHide: number,
    readonly visible: number,
  ) {
    super(
      `This build would hide ${wouldHide} of ${visible} visible listings (more than ${MASS_HIDE_SHARE * 100}% or ${MASS_HIDE_MIN}, ` +
        "whichever is more), which looks like a truncated or wrong file. Nothing was written. " +
        "Pass --allow-mass-hide if it is intended.",
    );
    this.name = "MassHideRefusedError";
  }
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) out.push(items.slice(i, i + BATCH_SIZE));
  return out;
}

interface PhoneColumns {
  readonly phone: string | null;
  readonly phoneFoundOn: string | null;
  readonly phoneCheckedOn: string | null;
  readonly phoneWhatsapp: boolean;
}

function phoneColumns(phone: ListingPhone | null): PhoneColumns {
  return {
    phone: phone?.e164 ?? null,
    phoneFoundOn: phone?.foundOn ?? null,
    phoneCheckedOn: phone?.checkedOn ?? null,
    phoneWhatsapp: phone?.whatsapp ?? false,
  };
}

/**
 * Makes directory_open_listings match one dataset build, in one transaction, so the website never sees half an import:
 * every row is created or updated (an unchanged row is not touched, so its updated_at and the version stay put), a
 * hidden row that is back is shown again, and a visible row the build no longer has is hidden (never deleted).
 * Every place id must already be in directory_places.
 *
 * Mass-hide guard: an empty build, or one that would hide more than max(MASS_HIDE_SHARE of the visible rows,
 * MASS_HIDE_MIN) (the floor keeps small directories workable), is refused before anything is written, unless
 * options.allowMassHide.
 *
 * Every timestamp written is the database's own transaction time, never the caller's clock: openListingsVersion
 * relies on max(updated_at) moving forward, and a skewed or backdated client clock would hide a change from the website.
 */
export async function syncOpenListings(
  db: Database,
  rows: readonly OpenListingInput[],
  options: SyncOptions = {},
): Promise<OpenListingSyncResult> {
  const ids = rows.map((row) => row.placeId);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new DuplicateListingError(id);
    seen.add(id);
  }

  return db.transaction(async (tx) => {
    // now() is the transaction's start time, the same for every write below.
    const now = sql`now()`;
    const t = directoryOpenListings;
    if (options.allowMassHide !== true) {
      const [counts] = await tx
        .select({
          visible: sql<number>`count(*)::int`,
          wouldHide: sql<number>`(count(*) filter (where not (${t.placeId} = any(${sql.param(ids)}::text[]))))::int`,
        })
        .from(t)
        .where(isNull(t.hiddenAt));
      const visible = counts?.visible ?? 0;
      const wouldHide = counts?.wouldHide ?? 0;
      if (rows.length === 0 || wouldHide > Math.max(visible * MASS_HIDE_SHARE, MASS_HIDE_MIN)) {
        throw new MassHideRefusedError(wouldHide, visible);
      }
    }

    const unknown: string[] = [];
    for (const batch of chunks(ids)) {
      const known = await tx.select({ id: directoryPlaces.id }).from(directoryPlaces).where(inArray(directoryPlaces.id, batch));
      const knownIds = new Set(known.map((row) => row.id));
      unknown.push(...batch.filter((id) => !knownIds.has(id)));
    }
    if (unknown.length > 0) throw new UnknownListingPlaceError(unknown);

    let created = 0;
    let updated = 0;
    for (const batch of chunks(rows)) {
      const written = await tx
        .insert(t)
        .values(
          batch.map((row) => ({
            placeId: row.placeId,
            name: row.name,
            categorySlug: row.categorySlug,
            citySlug: row.citySlug,
            areaSlug: row.areaSlug,
            address: row.address,
            lat: row.lat,
            lon: row.lon,
            website: row.website,
            source: row.source,
            ...phoneColumns(row.phone),
            hiddenAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: t.placeId,
          set: {
            name: sql`excluded.name`,
            categorySlug: sql`excluded.category_slug`,
            citySlug: sql`excluded.city_slug`,
            areaSlug: sql`excluded.area_slug`,
            address: sql`excluded.address`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            website: sql`excluded.website`,
            source: sql`excluded.source`,
            phone: sql`excluded.phone`,
            phoneFoundOn: sql`excluded.phone_found_on`,
            phoneCheckedOn: sql`excluded.phone_checked_on`,
            phoneWhatsapp: sql`excluded.phone_whatsapp`,
            hiddenAt: sql`null`,
            updatedAt: now,
          },
          // Only a real change (or a hidden row coming back) is written, so the version moves only then.
          setWhere: sql`${t.hiddenAt} is not null or (${t.name}, ${t.categorySlug}, ${t.citySlug}, ${t.areaSlug}, ${t.address},
            ${t.lat}, ${t.lon}, ${t.website}, ${t.source}, ${t.phone}, ${t.phoneFoundOn}, ${t.phoneCheckedOn}, ${t.phoneWhatsapp})
            is distinct from (excluded.name, excluded.category_slug, excluded.city_slug, excluded.area_slug, excluded.address,
            excluded.lat, excluded.lon, excluded.website, excluded.source, excluded.phone, excluded.phone_found_on,
            excluded.phone_checked_on, excluded.phone_whatsapp)`,
        })
        // xmax = 0 marks a freshly inserted row; an updated one has the updating transaction's id.
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const row of written) {
        if (row.inserted) created += 1;
        else updated += 1;
      }
    }

    const hiddenRows = await tx
      .update(t)
      .set({ hiddenAt: now, updatedAt: now })
      .where(and(isNull(t.hiddenAt), sql`not (${t.placeId} = any(${sql.param(ids)}::text[]))`))
      .returning({ placeId: t.placeId });

    return { created, updated, unchanged: rows.length - created - updated, hidden: hiddenRows.length };
  });
}

/** Up to `limit` visible listings after `after` (a place id), in place-id order: one page of the website's snapshot. */
export async function listVisibleOpenListings(
  db: Database,
  page: { readonly after: string | null; readonly limit: number },
): Promise<readonly VisibleOpenListing[]> {
  const t = directoryOpenListings;
  const rows = await db
    .select({
      placeId: t.placeId,
      name: t.name,
      categorySlug: t.categorySlug,
      citySlug: t.citySlug,
      areaSlug: t.areaSlug,
      address: t.address,
      lat: t.lat,
      lon: t.lon,
      website: t.website,
      source: t.source,
      phone: t.phone,
      phoneFoundOn: t.phoneFoundOn,
      phoneCheckedOn: t.phoneCheckedOn,
      phoneWhatsapp: t.phoneWhatsapp,
      urlCitySlug: directoryPlaces.citySlug,
      urlSlug: directoryPlaces.urlSlug,
    })
    .from(t)
    .innerJoin(directoryPlaces, eq(directoryPlaces.id, t.placeId))
    .where(page.after === null ? isNull(t.hiddenAt) : and(isNull(t.hiddenAt), gt(t.placeId, page.after)))
    .orderBy(asc(t.placeId))
    .limit(page.limit);
  return rows.map(({ phone, phoneFoundOn, phoneCheckedOn, phoneWhatsapp, ...rest }) => ({
    ...rest,
    phone:
      phone !== null && phoneFoundOn !== null && phoneCheckedOn !== null
        ? { e164: phone, foundOn: phoneFoundOn, checkedOn: phoneCheckedOn, whatsapp: phoneWhatsapp }
        : null,
  }));
}

/**
 * A string that changes whenever any listing is created, changed, hidden or shown again (every such write moves
 * updated_at), and also when a business's URL label changes. The website compares it before re-reading the snapshot.
 */
export async function openListingsVersion(db: Database): Promise<string> {
  const [row] = await db
    .select({
      visible: sql<number>`count(*) filter (where ${directoryOpenListings.hiddenAt} is null)::int`,
      listings: sql<string>`coalesce(max(${directoryOpenListings.updatedAt}), 'epoch')::text`,
      places: sql<string>`(select coalesce(max(${directoryPlaces.updatedAt}), 'epoch')::text from ${directoryPlaces})`,
    })
    .from(directoryOpenListings);
  return `${row?.visible ?? 0}|${row?.listings ?? "epoch"}|${row?.places ?? "epoch"}`;
}
