/**
 * An email address with most of its name hidden, for the line that says where a code went ("m•••@example.com"): enough
 * for the owner to recognise it, not enough for someone looking over their shoulder to read it. Browser-safe and pure.
 */
export function emailHint(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const name = email.slice(0, at);
  const domain = email.slice(at);
  return name.length >= 3 ? `${name.slice(0, 1)}•••${domain}` : `•••${domain}`;
}
