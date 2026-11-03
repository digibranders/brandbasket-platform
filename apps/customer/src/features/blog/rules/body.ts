/**
 * Reading a stored Lexical post body in the browser and on the server: its plain text, its headings, word count and
 * reading time. Ported from apps/platform lib/blog-text.ts and lib/blog-text-stats.ts. The grammar is the closed one the
 * platform's lib/blog-html.ts renders for client sites (that renderer stays with the site API in apps/platform): exactly
 * what the post editor's toolbar can produce. Anything else is skipped, so the counts match what the site shows.
 */

export type OutlineLevel = 2 | 3;

export interface OutlineHeading {
  /** The `id` the heading carries on the client site. */
  readonly id: string;
  readonly text: string;
  readonly level: OutlineLevel;
}

export interface LexicalNode {
  readonly type?: unknown;
  readonly children?: unknown;
  readonly text?: unknown;
  readonly format?: unknown;
  readonly tag?: unknown;
  readonly listType?: unknown;
  /** Where `@lexical/link`'s LinkNode (the post editor) keeps a link's address. */
  readonly url?: unknown;
  /** Where Payload's own link node keeps it. Both are read. */
  readonly fields?: { readonly url?: unknown } | null;
}

function asNodes(value: unknown): readonly LexicalNode[] {
  return Array.isArray(value) ? (value as readonly LexicalNode[]) : [];
}

function rootOf(document: unknown): LexicalNode | null {
  if (document === null || typeof document !== "object") return null;
  const root = (document as { readonly root?: LexicalNode | null }).root;
  return root === undefined || root === null ? null : root;
}

/** The toolbar makes h2 and h3; anything else is read as h2. */
function headingLevel(tag: unknown): OutlineLevel {
  return tag === "h3" ? 3 : 2;
}

/** A heading's words as an id: "Opening hours & prices" becomes "opening-hours-prices". */
function headingSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "section" : slug;
}

/** Hands out one unique id per heading, in document order: a second "Prices" becomes "prices-2". */
function headingIds(): (text: string) => string {
  const used = new Map<string, number>();
  return (text) => {
    const base = headingSlug(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

/** Mirrors the platform's HTML renderer exactly, so the plain text never includes words the site leaves out. */
function plainTextOf(node: LexicalNode): string {
  switch (node.type) {
    case "text":
      return typeof node.text === "string" ? node.text : "";
    case "linebreak":
      return " ";
    case "paragraph":
    case "heading":
    case "quote":
    case "listitem":
      return `${asNodes(node.children).map(plainTextOf).join("")} `;
    case "list":
    case "link":
    case "autolink":
      return asNodes(node.children).map(plainTextOf).join("");
    default:
      return "";
  }
}

function inlineText(node: LexicalNode): string {
  return plainTextOf(node).replace(/\s+/g, " ").trim();
}

/** The post's words with no markup and whitespace collapsed. Anything not shaped like a Lexical document gives "". */
export function lexicalToPlainText(document: unknown): string {
  const root = rootOf(document);
  if (root === null) return "";
  return asNodes(root.children).map(plainTextOf).join("").replace(/\s+/g, " ").trim();
}

/** The post's top-level headings in order, with the ids the site gives them. Headings with no words are left out. */
export function lexicalOutline(document: unknown): readonly OutlineHeading[] {
  const root = rootOf(document);
  if (root === null) return [];
  const nextHeadingId = headingIds();
  const outline: OutlineHeading[] = [];
  for (const node of asNodes(root.children)) {
    if (node.type !== "heading") continue;
    const text = inlineText(node);
    if (text === "") continue;
    outline.push({ id: nextHeadingId(text), text, level: headingLevel(node.tag) });
  }
  return outline;
}

/** A common adult reading pace for web articles. */
const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Whole minutes, rounded up, and at least one for any post with words; zero for an empty post. */
export function readingMinutes(words: number): number {
  return words <= 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * A Lexical document with a single empty paragraph: what a new post's body starts as, and what the editor reports when a
 * stored body cannot be loaded.
 */
export const EMPTY_BODY = {
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [{ type: "paragraph", format: "", indent: 0, version: 1, direction: null, children: [] }],
  },
} as const;

export const EMPTY_BODY_JSON = JSON.stringify(EMPTY_BODY);

/** A stored body as the JSON the editor starts from; the empty body for none or anything that will not serialise. */
export function bodyJsonOf(body: unknown): string {
  if (body === null || body === undefined) return EMPTY_BODY_JSON;
  try {
    return JSON.stringify(body) ?? EMPTY_BODY_JSON;
  } catch {
    return EMPTY_BODY_JSON;
  }
}
