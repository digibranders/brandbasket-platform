/**
 * A form's fields as one string, so "has anything been changed" is a comparison of two strings. A file field counts by
 * its file name, which is all a change needs here.
 */
export function formSnapshot(entries: Iterable<readonly [string, FormDataEntryValue]>): string {
  return JSON.stringify(Array.from(entries, ([name, value]) => [name, typeof value === "string" ? value : value.name]));
}
