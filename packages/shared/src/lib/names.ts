const FALLBACK_GREETING_NAME = "there";

/** Titles people put in front of their name; a greeting should not stop at one ("Hello, Dr."). */
const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "mx", "miss", "prof", "shri", "smt", "sri", "kumari"]);

/**
 * First word of a person's name, for greetings. A leading title is skipped when a name follows it, so "Dr Neha
 * Kulkarni" is greeted as "Neha"; a name that is only a title is kept as it is.
 */
export function firstName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((word) => word !== "");
  const [first, second] = words;
  if (first === undefined) return FALLBACK_GREETING_NAME;
  const isTitle = HONORIFICS.has(first.toLowerCase().replace(/\.$/, ""));
  return isTitle && second !== undefined ? second : first;
}

/** One or two initials for an avatar. Empty names give a single dash rather than an empty circle. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((part) => part !== "");
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials === "" ? "\u2013" : initials;
}
