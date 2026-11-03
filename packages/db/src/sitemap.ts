/**
 * Reads a sitemap (sitemaps.org protocol): either a `<urlset>` of pages or a `<sitemapindex>` of further sitemaps.
 * Pure: no fetching. Only `<loc>` values are read; a sitemap is machine-written XML, so a tag scan is enough and no
 * parser dependency is needed. Locations that are not http(s) URLs are dropped, and duplicates are dropped in order.
 */

export type ParsedSitemap =
  | { readonly kind: "urlset"; readonly urls: readonly string[] }
  | { readonly kind: "index"; readonly sitemaps: readonly string[] }
  | { readonly kind: "invalid" };

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(value: string): string {
  const unwrapped = value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");
  return unwrapped.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? "";
  });
}

function normalisedHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function locations(xml: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  // Namespaced tags (`<sm:loc>`) occur in the wild, so any prefix is accepted.
  for (const match of xml.matchAll(/<(?:[\w-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?loc\s*>/gi)) {
    const url = normalisedHttpUrl(decodeXmlText((match[1] ?? "").trim()));
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    found.push(url);
  }
  return found;
}

export function parseSitemap(xml: string): ParsedSitemap {
  if (/<(?:[\w-]+:)?sitemapindex\b/i.test(xml)) return { kind: "index", sitemaps: locations(xml) };
  if (/<(?:[\w-]+:)?urlset\b/i.test(xml)) return { kind: "urlset", urls: locations(xml) };
  return { kind: "invalid" };
}
