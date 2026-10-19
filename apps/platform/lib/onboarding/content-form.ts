import { z } from "zod";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import { httpsUrl } from "@/lib/validation/url";
import { fieldNameOf, textField, type StepParseResult } from "@brandbasket/shared/lib/onboarding/form-result";

export const MAX_SERVICES = 20;
export const MAX_REFERENCE_URLS = 5;

const SERVICE_KEY = /^services\.(\d{1,3})\.(id|name|summary|price)$/;
const REFERENCE_KEY = /^referenceUrls\.(\d{1,2})$/;

export interface ServiceInput {
  /** The saved service this row edits; absent for a new one. */
  readonly id?: string;
  readonly name: string;
  readonly summary: string | null;
  readonly priceText: string | null;
}

export interface ContentStepInput {
  readonly services: readonly ServiceInput[];
  readonly notesForBuilder: string | null;
  readonly styleLikes: string | null;
  readonly referenceUrls: readonly string[];
}

function optionalLine(max: number, tooLong: string) {
  return z
    .string()
    .transform(cleanLine)
    .pipe(z.string().max(max, tooLong))
    .transform((value) => (value === "" ? null : value));
}

function optionalBlock(max: number, tooLong: string) {
  return z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().max(max, tooLong))
    .transform((value) => (value === "" ? null : value));
}

const RELOAD_MESSAGE = "Your list of services has changed since this page loaded. Reload the page and try again.";

const serviceSchema = z.object({
  id: z.union([z.literal("").transform(() => undefined), z.uuid({ error: RELOAD_MESSAGE })]),
  name: z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(1, "Give this service a name.").max(80, "Keep the service name to 80 characters.")),
  summary: optionalLine(240, "Keep the description to 240 characters."),
  priceText: optionalLine(60, "Keep the price note to 60 characters."),
});

const contentSchema = z.object({
  services: z
    .array(serviceSchema)
    .min(1, "Add at least one service.")
    .max(MAX_SERVICES, `You can add up to ${MAX_SERVICES} services. We'll talk through the rest.`),
  notesForBuilder: optionalBlock(2000, "Keep this to 2,000 characters."),
  styleLikes: optionalBlock(600, "Keep this to 600 characters."),
  referenceUrls: z
    .array(httpsUrl({ invalid: "Paste the full link, starting https://", tooLong: "That link is too long." }))
    .max(MAX_REFERENCE_URLS, `Add up to ${MAX_REFERENCE_URLS} websites.`),
});

interface ServiceRow {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly price: string;
}

/**
 * Collects the numbered rows the list editor sends, in index order, skipping rows whose text is completely blank:
 * a saved row emptied out is a removal, whatever its id.
 */
function collectRows(formData: FormData): ServiceRow[] {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = SERVICE_KEY.exec(key);
    if (match?.[1] !== undefined) indices.add(Number(match[1]));
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      id: textField(formData, `services.${index}.id`).trim(),
      name: textField(formData, `services.${index}.name`),
      summary: textField(formData, `services.${index}.summary`),
      price: textField(formData, `services.${index}.price`),
    }))
    .filter((row) => `${row.name}${row.summary}${row.price}`.trim() !== "");
}

function collectReferenceUrls(formData: FormData): { readonly index: number; readonly value: string }[] {
  const entries: { readonly index: number; readonly value: string }[] = [];
  for (const key of formData.keys()) {
    const match = REFERENCE_KEY.exec(key);
    if (match?.[1] === undefined) continue;
    const value = textField(formData, key).trim();
    if (value !== "") entries.push({ index: Number(match[1]), value });
  }
  return entries.sort((a, b) => a.index - b.index);
}

/**
 * Step 02. Services arrive as `services.{n}.id|name|summary|price` from the list editor; the numbers only order the
 * rows, so gaps left by removed rows don't matter. `id` is present only on rows that edit a saved service and must
 * be a UUID; whether the business owns it is for the save to decide. Errors name the field as the form knows it
 * (`services.3.name`), so the page can focus the right input.
 */
export function parseContentForm(formData: FormData): StepParseResult<ContentStepInput> {
  const rows = collectRows(formData);
  const links = collectReferenceUrls(formData);
  const result = contentSchema.safeParse({
    services: rows.map((row) => ({ id: row.id, name: row.name, summary: row.summary, priceText: row.price })),
    notesForBuilder: textField(formData, "notesForBuilder"),
    styleLikes: textField(formData, "styleLikes"),
    referenceUrls: links.map((link) => link.value),
  });

  if (result.success) {
    return {
      success: true,
      data: {
        ...result.data,
        // Only a kept service carries its id, so "absent" and "new" mean the same thing downstream.
        services: result.data.services.map(({ id, ...service }) => (id === undefined ? service : { id, ...service })),
      },
    };
  }

  const issue = result.error.issues[0];
  if (issue === undefined) return { success: false, message: "Check this step and try again.", field: null };

  // Map a position in the cleaned list back to the row number the browser used.
  const [section, position, part] = issue.path;
  if (section === "services" && typeof position === "number") {
    const row = rows[position];
    // An id is a hidden field, so its problem is reported on the row's name, which can take focus.
    const formPart = part === "priceText" ? "price" : part === "id" ? "name" : part;
    return {
      success: false,
      message: issue.message,
      field: row === undefined ? "services" : `services.${row.index}.${String(formPart)}`,
    };
  }
  if (section === "services") {
    const firstRow = rows[0];
    return {
      success: false,
      message: issue.message,
      field: firstRow === undefined ? "services.0.name" : `services.${firstRow.index}.name`,
    };
  }
  if (section === "referenceUrls") {
    const link = typeof position === "number" ? links[position] : links[0];
    return {
      success: false,
      message: issue.message,
      field: link === undefined ? "referenceUrls.0" : `referenceUrls.${link.index}`,
    };
  }
  return { success: false, message: issue.message, field: fieldNameOf(issue.path) };
}
