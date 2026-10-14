import { cleanLine, cleanMultiline } from "@fynix/shared/lib/validation/text";
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
  ITEM_AREA_MAX_LENGTH,
  ITEM_CATEGORY_MAX_LENGTH,
  ITEM_DESCRIPTION_MAX_LENGTH,
  ITEM_NAME_MAX_LENGTH,
  ITEM_PRICE_MAX_INR,
  SERVICE_DEFAULT_CATEGORY,
  PRODUCT_AVAILABILITIES,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_SUMMARY_MAX_LENGTH,
  type ProductAvailability,
} from "@/lib/business-profile-fields";
import { OWNER_FORM_FIELDS_MESSAGE, ownerFormCheck } from "@/lib/owner-form";

/*
 * The Services, Products and FAQ tabs' forms (the owner's spec sheet): what a business does, what it stocks and what its
 * customers ask. Each form
 * posts one item, with its `id` when it edits one that exists. Browser-safe and pure: no database, no session.
 */

export const SERVICE_FORM_FIELDS = ["id", "name", "summary", "description", "price", "duration", "area"] as const;
export const PRODUCT_FORM_FIELDS = ["id", "name", "description", "price", "category", "availability"] as const;

export const FAQ_FORM_FIELDS = ["id", "question", "answer"] as const;

const isServiceForm = ownerFormCheck(SERVICE_FORM_FIELDS);
const isProductForm = ownerFormCheck(PRODUCT_FORM_FIELDS);
const isFaqForm = ownerFormCheck(FAQ_FORM_FIELDS);

/** The most minutes one service takes: a day. */
export const SERVICE_DURATION_MAX_MINUTES = 1440;

export interface ServiceInput {
  readonly category: string;
  readonly name: string;
  /** The one line under the name in the list. */
  readonly summary: string | null;
  /** The long explanation the popup shows. */
  readonly description: string | null;
  /** Whole rupees; null when the price is on request. */
  readonly priceInr: number | null;
  readonly durationMinutes: number | null;
  readonly serviceArea: string | null;
}

export interface ProductInput {
  readonly name: string;
  readonly description: string | null;
  readonly priceInr: number | null;
  readonly category: string | null;
  readonly availability: ProductAvailability;
}

export interface FaqInput {
  readonly question: string;
  readonly answer: string;
}

export type ItemParseResult<T> =
  /** `id` is the item being edited, or null for a new one. */
  | { readonly success: true; readonly id: string | null; readonly data: T }
  | { readonly success: false; readonly field: string | null; readonly message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fail(field: string | null, message: string): { readonly success: false; readonly field: string | null; readonly message: string } {
  return { success: false, field, message };
}

function tooLong(max: number): string {
  return `Keep it to ${String(max)} characters.`;
}

/** A required single line. */
function requiredLine(formData: FormData, key: string, max: number, missing: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = cleanLine(text(formData, key)).replace(/\s+/g, " ");
  if (value === "") return { ok: false, message: missing };
  if (value.length > max) return { ok: false, message: tooLong(max) };
  return { ok: true, value };
}

/** An optional single line: blank is null. */
function optionalLine(formData: FormData, key: string, max: number): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = cleanLine(text(formData, key)).replace(/\s+/g, " ");
  if (value.length > max) return { ok: false, message: tooLong(max) };
  return { ok: true, value: value === "" ? null : value };
}

function optionalDescription(formData: FormData, max: number = ITEM_DESCRIPTION_MAX_LENGTH): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = cleanMultiline(text(formData, "description"));
  if (value.length > max) return { ok: false, message: tooLong(max) };
  return { ok: true, value: value === "" ? null : value };
}

/** A price in whole rupees as typed: "1500", "1,500", "₹ 1,500". Blank is "on request" (null). */
export function parsePriceInr(typed: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const cleaned = typed.replace(/[₹,\s]|rs\.?/gi, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: "Enter the price in whole rupees, like 1500, or leave it empty." };
  const value = Number(cleaned);
  if (value > ITEM_PRICE_MAX_INR) return { ok: false, message: "That price is too high." };
  return { ok: true, value };
}

function readId(formData: FormData): { ok: true; id: string | null } | { ok: false } {
  const id = text(formData, "id").trim();
  if (id === "") return { ok: true, id: null };
  return UUID.test(id) ? { ok: true, id } : { ok: false };
}

export function parseServiceForm(formData: FormData): ItemParseResult<ServiceInput> {
  if (!isServiceForm(formData)) return fail(null, OWNER_FORM_FIELDS_MESSAGE);
  const id = readId(formData);
  if (!id.ok) return fail(null, OWNER_FORM_FIELDS_MESSAGE);

  const name = requiredLine(formData, "name", ITEM_NAME_MAX_LENGTH, "Enter the service's name.");
  if (!name.ok) return fail("name", name.message);
  const summary = optionalLine(formData, "summary", SERVICE_SUMMARY_MAX_LENGTH);
  if (!summary.ok) return fail("summary", summary.message);
  const description = optionalDescription(formData, SERVICE_DESCRIPTION_MAX_LENGTH);
  if (!description.ok) return fail("description", description.message);
  const price = parsePriceInr(text(formData, "price"));
  if (!price.ok) return fail("price", price.message);

  const typedDuration = text(formData, "duration").trim();
  let durationMinutes: number | null = null;
  if (typedDuration !== "") {
    const minutes = /^\d+$/.test(typedDuration) ? Number(typedDuration) : 0;
    if (minutes < 1 || minutes > SERVICE_DURATION_MAX_MINUTES) {
      return fail("duration", `Enter the minutes it takes, from 1 to ${String(SERVICE_DURATION_MAX_MINUTES)}.`);
    }
    durationMinutes = minutes;
  }
  const area = optionalLine(formData, "area", ITEM_AREA_MAX_LENGTH);
  if (!area.ok) return fail("area", area.message);

  return {
    success: true,
    id: id.id,
    data: {
      category: SERVICE_DEFAULT_CATEGORY,
      name: name.value,
      summary: summary.value,
      description: description.value,
      priceInr: price.value,
      durationMinutes,
      serviceArea: area.value,
    },
  };
}

function isAvailability(value: string): value is ProductAvailability {
  return (PRODUCT_AVAILABILITIES as readonly string[]).includes(value);
}

export function parseProductForm(formData: FormData): ItemParseResult<ProductInput> {
  if (!isProductForm(formData)) return fail(null, OWNER_FORM_FIELDS_MESSAGE);
  const id = readId(formData);
  if (!id.ok) return fail(null, OWNER_FORM_FIELDS_MESSAGE);

  const name = requiredLine(formData, "name", ITEM_NAME_MAX_LENGTH, "Enter the product's name.");
  if (!name.ok) return fail("name", name.message);
  const description = optionalDescription(formData);
  if (!description.ok) return fail("description", description.message);
  const price = parsePriceInr(text(formData, "price"));
  if (!price.ok) return fail("price", price.message);
  const category = optionalLine(formData, "category", ITEM_CATEGORY_MAX_LENGTH);
  if (!category.ok) return fail("category", category.message);
  const availability = text(formData, "availability");
  if (!isAvailability(availability)) return fail("availability", "Choose whether it is in stock.");

  return { success: true, id: id.id, data: { name: name.value, description: description.value, priceInr: price.value, category: category.value, availability } };
}

export function parseFaqForm(formData: FormData): ItemParseResult<FaqInput> {
  if (!isFaqForm(formData)) return fail(null, OWNER_FORM_FIELDS_MESSAGE);
  const id = readId(formData);
  if (!id.ok) return fail(null, OWNER_FORM_FIELDS_MESSAGE);

  const question = requiredLine(formData, "question", FAQ_QUESTION_MAX_LENGTH, "Enter the question your customers ask.");
  if (!question.ok) return fail("question", question.message);
  const answer = cleanMultiline(text(formData, "answer"));
  if (answer === "") return fail("answer", "Enter the answer.");
  if (answer.length > FAQ_ANSWER_MAX_LENGTH) return fail("answer", tooLong(FAQ_ANSWER_MAX_LENGTH));

  return { success: true, id: id.id, data: { question: question.value, answer } };
}

/** A delete form posts only the id of the item to remove. */
export const isItemDeleteForm = ownerFormCheck(["id"]);

export function readItemId(formData: FormData): string | null {
  const id = text(formData, "id").trim();
  return UUID.test(id) ? id : null;
}
