/** Onboarding-specific helpers built on the shared form-parsing result type; kept as its own module so existing
 * imports of `StepParseResult` and `textField` from here don't need to change. */
export type { FormParseResult as StepParseResult } from "../form-result";
export { textField } from "../form-result";

/** The path of a zod issue as the form's field name, e.g. ["hours", 2, "opens"] → "hours.2.opens". */
export function fieldNameOf(path: readonly PropertyKey[]): string | null {
  if (path.length === 0) return null;
  return path.map((part) => String(part)).join(".");
}

/** A checkbox is ticked when the browser sent it at all. */
export function checkboxField(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}
