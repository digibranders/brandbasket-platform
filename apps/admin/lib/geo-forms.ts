import {
  geoNameProblem,
  geoSlugify,
  geoSlugProblem,
  readKeywordList,
  readPinList,
} from "@brandbasket/db/geo-catalog-rules";
import { isIndiaStateCode } from "@brandbasket/db/india-states";

/*
 * Reading the Geography page's forms (districts, areas, categories) into values the catalog queries take, or a message
 * for the staff member. Pure: the actions call these, then the database. An address left empty is made from the name.
 */

export type GeoParse<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

type Form = Pick<FormData, "get">;

function text(form: Form, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failure(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}

/** The address typed, or one made from the name when it was left empty. */
function addressOf(form: Form, name: string): string {
  const typed = text(form, "slug");
  return typed === "" ? geoSlugify(name) : typed;
}

function number(form: Form, name: string): GeoParse<number | null> {
  const raw = text(form, name);
  if (raw === "") return { ok: true, value: null };
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? { ok: true, value: parsed } : failure("The map point must be numbers, like 19.2183 and 72.9781.");
}

export interface DistrictAdd {
  readonly stateCode: string;
  readonly name: string;
  readonly slug: string;
  readonly status: "off" | "soon";
}

export function parseDistrictAdd(form: Form): GeoParse<DistrictAdd> {
  const name = text(form, "name");
  const nameProblem = geoNameProblem(name);
  if (nameProblem !== null) return failure(nameProblem);
  const stateCode = text(form, "state");
  if (!isIndiaStateCode(stateCode)) return failure("Choose the state.");
  const slug = addressOf(form, name);
  const slugProblem = geoSlugProblem(slug);
  if (slugProblem !== null) return failure(slugProblem);
  return { ok: true, value: { stateCode, name, slug, status: text(form, "status") === "soon" ? "soon" : "off" } };
}

export interface DistrictSave {
  readonly id: string;
  readonly name: string;
  /** Null when the address is locked and the form does not carry it. */
  readonly slug: string | null;
  readonly status: "live" | "soon" | "off";
}

export function parseDistrictSave(form: Form): GeoParse<DistrictSave> {
  const id = text(form, "id");
  if (id === "") return failure("That district could not be found.");
  const name = text(form, "name");
  const nameProblem = geoNameProblem(name);
  if (nameProblem !== null) return failure(nameProblem);
  const status = text(form, "status");
  if (status !== "live" && status !== "soon" && status !== "off") return failure("Choose Live, Soon or Off.");
  const slug = form.get("slug") === null ? null : text(form, "slug");
  if (slug !== null) {
    const slugProblem = geoSlugProblem(slug);
    if (slugProblem !== null) return failure(slugProblem);
  }
  return { ok: true, value: { id, name, slug, status } };
}

export interface AreaFields {
  readonly name: string;
  readonly cityName: string;
  readonly pincodes: readonly string[];
  readonly lat: number | null;
  readonly lon: number | null;
}

function areaFields(form: Form): GeoParse<AreaFields> {
  const name = text(form, "name");
  const nameProblem = geoNameProblem(name);
  if (nameProblem !== null) return failure(nameProblem);
  const cityName = text(form, "town");
  const townProblem = geoNameProblem(cityName);
  if (townProblem !== null) return failure(`Town: ${townProblem}`);
  const pins = readPinList(text(form, "pins"));
  if (pins.invalid.length > 0) return failure(`These are not PIN codes: ${pins.invalid.join(", ")}.`);
  const lat = number(form, "lat");
  if (!lat.ok) return lat;
  const lon = number(form, "lon");
  if (!lon.ok) return lon;
  if ((lat.value === null) !== (lon.value === null)) return failure("Give both the latitude and the longitude, or neither.");
  return { ok: true, value: { name, cityName, pincodes: pins.pincodes, lat: lat.value, lon: lon.value } };
}

export interface AreaAdd extends AreaFields {
  readonly districtId: string;
  readonly slug: string;
  readonly on: boolean;
}

export function parseAreaAdd(form: Form): GeoParse<AreaAdd> {
  const districtId = text(form, "district");
  if (districtId === "") return failure("Choose the district.");
  const fields = areaFields(form);
  if (!fields.ok) return fields;
  const slug = addressOf(form, fields.value.name);
  const slugProblem = geoSlugProblem(slug);
  if (slugProblem !== null) return failure(slugProblem);
  return { ok: true, value: { ...fields.value, districtId, slug, on: form.get("on") === "on" } };
}

export interface AreaSave extends AreaFields {
  readonly id: string;
  readonly slug: string | null;
  readonly status: "on" | "off";
}

export function parseAreaSave(form: Form): GeoParse<AreaSave> {
  const id = text(form, "id");
  if (id === "") return failure("That area could not be found.");
  const fields = areaFields(form);
  if (!fields.ok) return fields;
  const slug = form.get("slug") === null ? null : text(form, "slug");
  if (slug !== null) {
    const slugProblem = geoSlugProblem(slug);
    if (slugProblem !== null) return failure(slugProblem);
  }
  return { ok: true, value: { ...fields.value, id, slug, status: text(form, "status") === "on" ? "on" : "off" } };
}

export interface CategoryFields {
  readonly label: string;
  readonly singular: string;
  readonly parentSlug: string | null;
  readonly keywords: readonly string[];
  readonly hasPage: boolean;
}

function categoryFields(form: Form): GeoParse<CategoryFields> {
  const label = text(form, "label");
  const labelProblem = geoNameProblem(label);
  if (labelProblem !== null) return failure(labelProblem);
  const singular = text(form, "singular");
  const singularProblem = geoNameProblem(singular);
  if (singularProblem !== null) return failure(`Single name: ${singularProblem}`);
  const parent = text(form, "parent");
  return {
    ok: true,
    value: {
      label,
      singular,
      parentSlug: parent === "" ? null : parent,
      keywords: readKeywordList(text(form, "keywords")),
      hasPage: form.get("page") === "on",
    },
  };
}

export interface CategoryAdd extends CategoryFields {
  readonly slug: string;
  readonly on: boolean;
}

export function parseCategoryAdd(form: Form): GeoParse<CategoryAdd> {
  const fields = categoryFields(form);
  if (!fields.ok) return fields;
  const slug = addressOf(form, fields.value.label);
  const slugProblem = geoSlugProblem(slug);
  if (slugProblem !== null) return failure(slugProblem);
  return { ok: true, value: { ...fields.value, slug, on: form.get("on") === "on" } };
}

export interface CategorySave extends CategoryFields {
  readonly id: string;
  readonly slug: string | null;
  readonly status: "on" | "off";
}

export function parseCategorySave(form: Form): GeoParse<CategorySave> {
  const id = text(form, "id");
  if (id === "") return failure("That category could not be found.");
  const fields = categoryFields(form);
  if (!fields.ok) return fields;
  const slug = form.get("slug") === null ? null : text(form, "slug");
  if (slug !== null) {
    const slugProblem = geoSlugProblem(slug);
    if (slugProblem !== null) return failure(slugProblem);
  }
  return { ok: true, value: { ...fields.value, id, slug, status: text(form, "status") === "on" ? "on" : "off" } };
}
