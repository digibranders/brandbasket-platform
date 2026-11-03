/** Joins class names, skipping empty ones. Primitives put their own classes first, so a caller's className comes last. */
export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
