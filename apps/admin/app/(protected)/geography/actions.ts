"use server";

import {
  createGeoArea,
  createGeoCategory,
  createGeoDistrict,
  GeoCatalogError,
  loadGeoAdminCatalog,
  updateGeoArea,
  updateGeoCategory,
  updateGeoDistrict,
} from "@brandbasket/db";
import { geoSlugify } from "@brandbasket/db/geo-catalog-rules";
import { stateName } from "@brandbasket/db/india-states";
import { refreshGeoCatalog } from "@brandbasket/shared/lib/directory/geo-catalog-source";
import { revalidatePath } from "next/cache";
import type { GeoFormState } from "@/lib/geo-form-state";
import {
  parseAreaAdd,
  parseAreaSave,
  parseCategoryAdd,
  parseCategorySave,
  parseDistrictAdd,
  parseDistrictSave,
  type GeoParse,
} from "@/lib/geo-forms";
import { getStaffDb } from "@/lib/server/db";
import { locateArea } from "@/lib/server/geocode";
import { requireStaffAccess } from "@/lib/server/staff-access";

/*
 * The Geography page's actions. A refused edit comes back as a message beside the row it was for; a good one saves,
 * brings this process's places and categories up to date at once (the website and the platform pick it up within a
 * minute) and says "Saved". Nothing here deletes: switching a row off is the way to retire it.
 */

/** What the save says about the map point: nothing when staff typed it, else whether it was found. */
function pointNote(typed: boolean, found: { readonly lat: number; readonly lon: number } | null): string | undefined {
  if (typed) return undefined;
  return found === null ? "no map point found, type one if you can" : `map point found (${found.lat}, ${found.lon})`;
}

const SAVED: GeoFormState = { status: "saved", message: "Saved" };

function refused(message: string): GeoFormState {
  return { status: "error", message };
}

/** Runs one edit as staff: parse, write, refresh. A catalog refusal is shown as written; anything else is thrown. */
async function run<T>(
  formData: FormData,
  parse: (form: FormData) => GeoParse<T>,
  write: (value: T) => Promise<string | void>,
): Promise<GeoFormState> {
  await requireStaffAccess();
  const parsed = parse(formData);
  if (!parsed.ok) return refused(parsed.message);
  let note: string | void;
  try {
    note = await write(parsed.value);
  } catch (error) {
    if (error instanceof GeoCatalogError) return refused(error.message);
    throw error;
  }
  await refreshGeoCatalog(getStaffDb(), { force: true });
  revalidatePath("/geography");
  return note === undefined ? SAVED : { status: "saved", message: `Saved · ${note}` };
}

export async function addDistrictAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseDistrictAdd, async (value) => {
    const db = getStaffDb();
    const id = await createGeoDistrict(db, { stateCode: value.stateCode, slug: value.slug, name: value.name });
    if (value.status !== "off") await updateGeoDistrict(db, id, { status: value.status });
  });
}

export async function saveDistrictAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseDistrictSave, (value) =>
    updateGeoDistrict(getStaffDb(), value.id, { name: value.name, status: value.status, ...(value.slug === null ? {} : { slug: value.slug }) }),
  );
}

export async function addAreaAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseAreaAdd, async (value) => {
    const db = getStaffDb();
    // A town the district already has keeps its address; a new one gets one from its name.
    const catalog = await loadGeoAdminCatalog(db);
    const district = catalog.districts.find((candidate) => candidate.id === value.districtId);
    if (district === undefined) throw new GeoCatalogError("That district does not exist.");
    const sameTown = catalog.areas.find(
      (area) => area.stateCode === district.stateCode && area.districtSlug === district.slug && area.cityName.toLowerCase() === value.cityName.toLowerCase(),
    );
    const citySlug = sameTown?.citySlug ?? geoSlugify(value.cityName);
    if (citySlug === "") throw new GeoCatalogError("Town: use letters or digits in the name.");
    const cityName = sameTown?.cityName ?? value.cityName;
    const found =
      value.lat !== null
        ? null
        : await locateArea({ name: value.name, town: cityName, stateName: stateName(district.stateCode) ?? "", pincodes: value.pincodes });
    const id = await createGeoArea(db, {
      districtId: value.districtId,
      slug: value.slug,
      name: value.name,
      citySlug,
      cityName,
      pincodes: value.pincodes,
      lat: value.lat ?? found?.lat ?? null,
      lon: value.lon ?? found?.lon ?? null,
    });
    if (value.on) await updateGeoArea(db, id, { status: "on" });
    return pointNote(value.lat !== null, found);
  });
}

export async function saveAreaAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseAreaSave, async (value) => {
    const db = getStaffDb();
    const catalog = await loadGeoAdminCatalog(db);
    const current = catalog.areas.find((area) => area.id === value.id);
    if (current === undefined) throw new GeoCatalogError("That area does not exist.");
    // Renaming the town of one area re-labels only that area; a name another area of the district has keeps its address.
    const sameTown = catalog.areas.find(
      (area) =>
        area.id !== value.id &&
        area.stateCode === current.stateCode &&
        area.districtSlug === current.districtSlug &&
        area.cityName.toLowerCase() === value.cityName.toLowerCase(),
    );
    const citySlug = sameTown?.citySlug ?? (value.cityName === current.cityName ? current.citySlug : geoSlugify(value.cityName));
    if (citySlug === "") throw new GeoCatalogError("Town: use letters or digits in the name.");
    const cityName = sameTown?.cityName ?? value.cityName;
    const found =
      value.lat !== null
        ? null
        : await locateArea({ name: value.name, town: cityName, stateName: stateName(current.stateCode) ?? "", pincodes: value.pincodes });
    await updateGeoArea(db, value.id, {
      name: value.name,
      cityName,
      citySlug,
      pincodes: value.pincodes,
      lat: value.lat ?? found?.lat ?? null,
      lon: value.lon ?? found?.lon ?? null,
      status: value.status,
      ...(value.slug === null ? {} : { slug: value.slug }),
    });
    return pointNote(value.lat !== null, found);
  });
}

export async function addCategoryAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseCategoryAdd, async (value) => {
    const db = getStaffDb();
    const id = await createGeoCategory(db, {
      slug: value.slug,
      label: value.label,
      singular: value.singular,
      parentSlug: value.parentSlug,
      keywords: value.keywords,
      hasPage: value.hasPage,
    });
    if (value.on) await updateGeoCategory(db, id, { status: "on" });
  });
}

export async function saveCategoryAction(_previous: GeoFormState, formData: FormData): Promise<GeoFormState> {
  return run(formData, parseCategorySave, (value) =>
    updateGeoCategory(getStaffDb(), value.id, {
      label: value.label,
      singular: value.singular,
      parentSlug: value.parentSlug,
      keywords: value.keywords,
      hasPage: value.hasPage,
      status: value.status,
      ...(value.slug === null ? {} : { slug: value.slug }),
    }),
  );
}
