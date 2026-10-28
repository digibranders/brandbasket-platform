/** The longest path we keep. */
const MAX_PATH = 200;
const MAX_CAMPAIGN = 60;

/**
 * The page a hit happened on, as one stable key: the path only (no query, no fragment, no host), lower case, no trailing
 * slash, at most 200 characters. A path segment that holds an email address is replaced, so an address in a URL is never
 * stored. Null for anything that is not a path or an address.
 */
export function normalizePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (text === "") return null;
  let pathname: string;
  try {
    // The base only lets a bare path parse; it is never kept.
    pathname = new URL(text, "https://placeholder.invalid").pathname;
  } catch {
    return null;
  }
  const segments = pathname.toLowerCase().split("/").map((segment) => (/@|%40/.test(segment) ? "redacted" : segment));
  const joined = segments.join("/");
  const trimmed = joined.length > 1 ? joined.replace(/\/+$/, "") : joined;
  return (trimmed === "" ? "/" : trimmed).slice(0, MAX_PATH);
}

/**
 * A campaign name, source or medium from the address (utm_campaign and the like), or null. Lower case, single spaces,
 * at most 60 characters. A value that looks like an email address or holds a run of six or more digits is dropped,
 * because it is more likely a person's detail than a campaign.
 */
export function cleanCampaign(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (text === "" || text.includes("@") || /\d{6,}/.test(text)) return null;
  return text.slice(0, MAX_CAMPAIGN);
}
