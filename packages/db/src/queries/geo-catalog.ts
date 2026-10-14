import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { geoNameProblem, geoSlugProblem } from "../geo-catalog-rules";
import { geoAreas, geoCategories, geoDistricts, type GeoDistrictStatus, type GeoItemStatus } from "../schema/geo-catalog";

/*
 * Reading and editing the geography and category catalog (schema/geo-catalog.ts). `loadGeoCatalog` is what the platform
 * and the website read; the create/update functions are the staff console's. A new row is a draft (off, slug free);
 * switching it on locks its slug for good (the database trigger in migration 0113 enforces it, and these functions say
 * so first in plain words). Nothing is deleted.
 */

/** A refusal staff can act on; its message is shown to them as written. */
export class GeoCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoCatalogError";
  }
}

export interface GeoCatalogDistrict {
  readonly stateCode: string;
  readonly slug: string;
  readonly name: string;
  readonly status: GeoDistrictStatus;
}

export interface GeoCatalogArea {
  readonly stateCode: string;
  readonly districtSlug: string;
  readonly slug: string;
  readonly name: string;
  readonly citySlug: string;
  readonly cityName: string;
  readonly pincodes: readonly string[];
  readonly lat: number | null;
  readonly lon: number | null;
  readonly status: GeoItemStatus;
}

export interface GeoCatalogCategory {
  readonly slug: string;
  readonly label: string;
  readonly singular: string;
  readonly parentSlug: string | null;
  readonly keywords: readonly string[];
  readonly taxonomyId: string | null;
  readonly hasPage: boolean;
  readonly status: GeoItemStatus;
}

/** Everything the catalog holds, drafts and switched-off rows included: a reader decides what to show. */
export interface GeoCatalogSnapshot {
  readonly districts: readonly GeoCatalogDistrict[];
  readonly areas: readonly GeoCatalogArea[];
  readonly categories: readonly GeoCatalogCategory[];
}

export async function loadGeoCatalog(db: Database): Promise<GeoCatalogSnapshot> {
  const [districts, areas, categories] = await Promise.all([
    db
      .select({ stateCode: geoDistricts.stateCode, slug: geoDistricts.slug, name: geoDistricts.name, status: geoDistricts.status })
      .from(geoDistricts)
      .orderBy(asc(geoDistricts.stateCode), asc(geoDistricts.name)),
    db
      .select({
        stateCode: geoDistricts.stateCode,
        districtSlug: geoDistricts.slug,
        slug: geoAreas.slug,
        name: geoAreas.name,
        citySlug: geoAreas.citySlug,
        cityName: geoAreas.cityName,
        pincodes: geoAreas.pincodes,
        lat: geoAreas.lat,
        lon: geoAreas.lon,
        status: geoAreas.status,
      })
      .from(geoAreas)
      .innerJoin(geoDistricts, eq(geoAreas.districtId, geoDistricts.id))
      .orderBy(asc(geoAreas.name)),
    db
      .select({
        slug: geoCategories.slug,
        label: geoCategories.label,
        singular: geoCategories.singular,
        parentSlug: geoCategories.parentSlug,
        keywords: geoCategories.keywords,
        taxonomyId: geoCategories.taxonomyId,
        hasPage: geoCategories.hasPage,
        status: geoCategories.status,
      })
      .from(geoCategories)
      .orderBy(asc(geoCategories.label)),
  ]);
  return { districts, areas, categories };
}

/* ---------- the staff console's view ---------- */

export interface GeoAdminDistrict extends GeoCatalogDistrict {
  readonly id: string;
  /** False while the district is a draft: its address can still be renamed. */
  readonly slugLocked: boolean;
  readonly areaCount: number;
}

export interface GeoAdminArea extends GeoCatalogArea {
  readonly id: string;
  readonly slugLocked: boolean;
}

export interface GeoAdminCategory extends GeoCatalogCategory {
  readonly id: string;
  readonly slugLocked: boolean;
}

export interface GeoAdminCatalog {
  readonly districts: readonly GeoAdminDistrict[];
  readonly areas: readonly GeoAdminArea[];
  readonly categories: readonly GeoAdminCategory[];
}

export async function loadGeoAdminCatalog(db: Database): Promise<GeoAdminCatalog> {
  const [districts, areas, categories] = await Promise.all([
    db
      .select({
        id: geoDistricts.id,
        stateCode: geoDistricts.stateCode,
        slug: geoDistricts.slug,
        name: geoDistricts.name,
        status: geoDistricts.status,
        slugLocked: sql<boolean>`${geoDistricts.slugLockedAt} is not null`,
        areaCount: sql<number>`(select count(*)::int from geo_areas where geo_areas.district_id = geo_districts.id)`,
      })
      .from(geoDistricts)
      .orderBy(sql`case ${geoDistricts.status} when 'live' then 0 when 'soon' then 1 else 2 end`, asc(geoDistricts.stateCode), asc(geoDistricts.name)),
    db
      .select({
        id: geoAreas.id,
        stateCode: geoDistricts.stateCode,
        districtSlug: geoDistricts.slug,
        slug: geoAreas.slug,
        name: geoAreas.name,
        citySlug: geoAreas.citySlug,
        cityName: geoAreas.cityName,
        pincodes: geoAreas.pincodes,
        lat: geoAreas.lat,
        lon: geoAreas.lon,
        status: geoAreas.status,
        slugLocked: sql<boolean>`${geoAreas.slugLockedAt} is not null`,
      })
      .from(geoAreas)
      .innerJoin(geoDistricts, eq(geoAreas.districtId, geoDistricts.id))
      .orderBy(asc(geoAreas.name)),
    db
      .select({
        id: geoCategories.id,
        slug: geoCategories.slug,
        label: geoCategories.label,
        singular: geoCategories.singular,
        parentSlug: geoCategories.parentSlug,
        keywords: geoCategories.keywords,
        taxonomyId: geoCategories.taxonomyId,
        hasPage: geoCategories.hasPage,
        status: geoCategories.status,
        slugLocked: sql<boolean>`${geoCategories.slugLockedAt} is not null`,
      })
      .from(geoCategories)
      .orderBy(asc(geoCategories.label)),
  ]);
  return { districts, areas, categories };
}

/* ---------- edits ---------- */

function checkName(name: string, what: string): string {
  const trimmed = name.trim();
  const problem = geoNameProblem(trimmed);
  if (problem !== null) throw new GeoCatalogError(`${what}: ${problem}`);
  return trimmed;
}

function checkSlug(slug: string): void {
  const problem = geoSlugProblem(slug);
  if (problem !== null) throw new GeoCatalogError(problem);
}

function checkPoint(lat: number | null, lon: number | null): void {
  if ((lat === null) !== (lon === null)) throw new GeoCatalogError("Give both the latitude and the longitude, or neither.");
  if (lat !== null && lon !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new GeoCatalogError("Latitude must be between -90 and 90.");
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new GeoCatalogError("Longitude must be between -180 and 180.");
  }
}

/** Turns the database's refusals of a slug change or a duplicate into a message staff can act on. */
function translateWriteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
  const causeCode = cause?.code ?? code;
  const causeMessage = cause?.message ?? message;
  if (causeCode === "23505") throw new GeoCatalogError("That address is already taken here. Choose another.");
  if (causeCode === "23514" && /is locked|cannot change|cannot move/.test(causeMessage)) throw new GeoCatalogError(causeMessage.replace(/^error: /i, ""));
  throw error;
}

/* Districts */

export interface NewGeoDistrict {
  readonly stateCode: string;
  readonly slug: string;
  readonly name: string;
}

/** A new district starts as a draft: off, its address still free. */
export async function createGeoDistrict(db: Database, input: NewGeoDistrict): Promise<string> {
  const name = checkName(input.name, "District");
  checkSlug(input.slug);
  try {
    const rows = await db.insert(geoDistricts).values({ stateCode: input.stateCode, slug: input.slug, name, status: "off" }).returning({ id: geoDistricts.id });
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("The district was not saved.");
    return id;
  } catch (error) {
    return translateWriteError(error);
  }
}

export interface GeoDistrictPatch {
  readonly name?: string;
  readonly slug?: string;
  readonly status?: GeoDistrictStatus;
}

export async function updateGeoDistrict(db: Database, id: string, patch: GeoDistrictPatch): Promise<void> {
  const current = (await db.select().from(geoDistricts).where(eq(geoDistricts.id, id)).limit(1))[0];
  if (current === undefined) throw new GeoCatalogError("That district does not exist.");
  const values: Partial<typeof geoDistricts.$inferInsert> = {};
  if (patch.name !== undefined) values.name = checkName(patch.name, "District");
  if (patch.slug !== undefined && patch.slug !== current.slug) {
    checkSlug(patch.slug);
    if (current.slugLockedAt !== null) throw new GeoCatalogError(`The address "${current.slug}" is permanent because the district has been published.`);
    values.slug = patch.slug;
  }
  if (patch.status !== undefined && patch.status !== current.status) {
    if (patch.status === "live") {
      const open = await db.$count(geoAreas, and(eq(geoAreas.districtId, id), eq(geoAreas.status, "on")));
      if (open === 0) throw new GeoCatalogError("Add and switch on at least one area before making the district live.");
    }
    values.status = patch.status;
  }
  if (Object.keys(values).length === 0) return;
  try {
    await db.update(geoDistricts).set(values).where(eq(geoDistricts.id, id));
  } catch (error) {
    translateWriteError(error);
  }
}

/* Areas */

export interface NewGeoArea {
  readonly districtId: string;
  readonly slug: string;
  readonly name: string;
  readonly citySlug: string;
  readonly cityName: string;
  readonly pincodes: readonly string[];
  readonly lat: number | null;
  readonly lon: number | null;
}

/** An area's address must not be a category's: /in/mh/thane/<x> is read as an area before a category. */
async function assertAreaSlugFree(db: Database, slug: string): Promise<void> {
  const clash = await db.$count(geoCategories, eq(geoCategories.slug, slug));
  if (clash > 0) throw new GeoCatalogError(`"${slug}" is already a category, so it cannot also be an area. Choose another address.`);
}

export async function createGeoArea(db: Database, input: NewGeoArea): Promise<string> {
  const name = checkName(input.name, "Area");
  checkName(input.cityName, "Town");
  checkSlug(input.slug);
  checkSlug(input.citySlug);
  checkPoint(input.lat, input.lon);
  await assertAreaSlugFree(db, input.slug);
  try {
    const rows = await db
      .insert(geoAreas)
      .values({
        districtId: input.districtId,
        slug: input.slug,
        name,
        citySlug: input.citySlug,
        cityName: input.cityName.trim(),
        pincodes: [...input.pincodes],
        lat: input.lat,
        lon: input.lon,
        status: "off",
      })
      .returning({ id: geoAreas.id });
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("The area was not saved.");
    return id;
  } catch (error) {
    return translateWriteError(error);
  }
}

export interface GeoAreaPatch {
  readonly name?: string;
  readonly slug?: string;
  readonly cityName?: string;
  readonly citySlug?: string;
  readonly pincodes?: readonly string[];
  readonly lat?: number | null;
  readonly lon?: number | null;
  readonly status?: GeoItemStatus;
}

export async function updateGeoArea(db: Database, id: string, patch: GeoAreaPatch): Promise<void> {
  const current = (await db.select().from(geoAreas).where(eq(geoAreas.id, id)).limit(1))[0];
  if (current === undefined) throw new GeoCatalogError("That area does not exist.");
  const values: Partial<typeof geoAreas.$inferInsert> = {};
  if (patch.name !== undefined) values.name = checkName(patch.name, "Area");
  if (patch.cityName !== undefined) values.cityName = checkName(patch.cityName, "Town");
  if (patch.citySlug !== undefined) {
    checkSlug(patch.citySlug);
    values.citySlug = patch.citySlug;
  }
  if (patch.pincodes !== undefined) values.pincodes = [...patch.pincodes];
  if (patch.lat !== undefined || patch.lon !== undefined) {
    const lat = patch.lat === undefined ? current.lat : patch.lat;
    const lon = patch.lon === undefined ? current.lon : patch.lon;
    checkPoint(lat, lon);
    values.lat = lat;
    values.lon = lon;
  }
  if (patch.slug !== undefined && patch.slug !== current.slug) {
    checkSlug(patch.slug);
    if (current.slugLockedAt !== null) throw new GeoCatalogError(`The address "${current.slug}" is permanent because the area has been published.`);
    await assertAreaSlugFree(db, patch.slug);
    values.slug = patch.slug;
  }
  if (patch.status !== undefined) values.status = patch.status;
  if (Object.keys(values).length === 0) return;
  try {
    await db.update(geoAreas).set(values).where(eq(geoAreas.id, id));
  } catch (error) {
    translateWriteError(error);
  }
}

/* Categories */

export interface NewGeoCategory {
  readonly slug: string;
  readonly label: string;
  readonly singular: string;
  readonly parentSlug: string | null;
  readonly keywords: readonly string[];
  readonly hasPage: boolean;
}

async function assertCategorySlugFree(db: Database, slug: string): Promise<void> {
  const clash = await db.$count(geoAreas, eq(geoAreas.slug, slug));
  if (clash > 0) throw new GeoCatalogError(`"${slug}" is already an area, so it cannot also be a category. Choose another address.`);
}

async function assertParent(db: Database, parentSlug: string | null, ownSlug: string): Promise<void> {
  if (parentSlug === null) return;
  if (parentSlug === ownSlug) throw new GeoCatalogError("A category cannot be its own parent.");
  const parent = (await db.select({ parentSlug: geoCategories.parentSlug }).from(geoCategories).where(eq(geoCategories.slug, parentSlug)).limit(1))[0];
  if (parent === undefined) throw new GeoCatalogError(`There is no category "${parentSlug}" to be the parent.`);
  if (parent.parentSlug !== null) throw new GeoCatalogError("A sub-category cannot have sub-categories of its own.");
}

export async function createGeoCategory(db: Database, input: NewGeoCategory): Promise<string> {
  const label = checkName(input.label, "Category");
  const singular = checkName(input.singular, "Singular name");
  checkSlug(input.slug);
  await assertCategorySlugFree(db, input.slug);
  await assertParent(db, input.parentSlug, input.slug);
  try {
    const rows = await db
      .insert(geoCategories)
      .values({
        slug: input.slug,
        label,
        singular,
        parentSlug: input.parentSlug,
        keywords: [...input.keywords],
        hasPage: input.hasPage,
        status: "off",
      })
      .returning({ id: geoCategories.id });
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("The category was not saved.");
    return id;
  } catch (error) {
    return translateWriteError(error);
  }
}

export interface GeoCategoryPatch {
  readonly label?: string;
  readonly singular?: string;
  readonly slug?: string;
  readonly parentSlug?: string | null;
  readonly keywords?: readonly string[];
  readonly hasPage?: boolean;
  readonly status?: GeoItemStatus;
}

export async function updateGeoCategory(db: Database, id: string, patch: GeoCategoryPatch): Promise<void> {
  const current = (await db.select().from(geoCategories).where(eq(geoCategories.id, id)).limit(1))[0];
  if (current === undefined) throw new GeoCatalogError("That category does not exist.");
  const values: Partial<typeof geoCategories.$inferInsert> = {};
  if (patch.label !== undefined) values.label = checkName(patch.label, "Category");
  if (patch.singular !== undefined) values.singular = checkName(patch.singular, "Singular name");
  if (patch.keywords !== undefined) values.keywords = [...patch.keywords];
  if (patch.hasPage !== undefined) values.hasPage = patch.hasPage;
  if (patch.parentSlug !== undefined && patch.parentSlug !== current.parentSlug) {
    await assertParent(db, patch.parentSlug, current.slug);
    if (patch.parentSlug !== null) {
      const children = await db.$count(geoCategories, and(eq(geoCategories.parentSlug, current.slug), ne(geoCategories.id, id)));
      if (children > 0) throw new GeoCatalogError("This category has sub-categories, so it cannot become one itself.");
    }
    values.parentSlug = patch.parentSlug;
  }
  if (patch.slug !== undefined && patch.slug !== current.slug) {
    checkSlug(patch.slug);
    if (current.slugLockedAt !== null) throw new GeoCatalogError(`The address "${current.slug}" is permanent because the category has been published.`);
    await assertCategorySlugFree(db, patch.slug);
    values.slug = patch.slug;
  }
  if (patch.status !== undefined) values.status = patch.status;
  if (Object.keys(values).length === 0) return;
  try {
    await db.update(geoCategories).set(values).where(eq(geoCategories.id, id));
  } catch (error) {
    translateWriteError(error);
  }
}
