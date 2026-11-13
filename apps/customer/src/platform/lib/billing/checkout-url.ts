/**
 * A checkout URL from the billing provider is only followed if it is a path on this site (the fake provider) or an
 * https URL (a real provider). Anything else, such as a protocol-relative `//host` or a `javascript:` URL, is refused.
 */
export function isSafeCheckoutUrl(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
