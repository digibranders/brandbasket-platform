/** Every form parser in this package returns this: the clean data, or the first problem and the field it belongs to. */
export type FormParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly message: string; readonly field: string | null };

/** Reads a text field; anything that isn't a string (a missing field, a file) reads as empty. */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
