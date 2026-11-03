import type { z } from "zod";
import { actionFail, type ActionFailure, type FieldErrors } from "./action-result";

/** The message above a form whose fields did not pass. */
export const INVALID_FORM_MESSAGE = "Check the fields marked below.";

export type ParsedForm<T> = { readonly ok: true; readonly data: T } | ActionFailure;

/**
 * FormData as a plain object for a schema: a name sent once is its value, a name sent more than once (checkboxes, a
 * multiple select) is the list of its values.
 */
export function formDataObject(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    out[key] = values.length === 1 ? (values[0] as FormDataEntryValue) : values;
  }
  return out;
}

/**
 * Validates a submitted form against a zod schema. On failure it returns the ActionResult the action hands straight back:
 * the first message for each field (a field's own path, or "form" for an error on the whole object) and one message above.
 */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData, message: string = INVALID_FORM_MESSAGE): ParsedForm<z.output<S>> {
  const parsed = schema.safeParse(formDataObject(formData));
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length === 0 ? "form" : issue.path.map(String).join(".");
    fieldErrors[key] ??= issue.message;
  }
  return actionFail(message, fieldErrors satisfies FieldErrors);
}
