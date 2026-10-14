/**
 * The parts of reading a stored Lexical post body that need no HTML: its plain text, its headings (the table of
 * contents) and the ids those headings get. Safe to import from the browser — lib/blog-html.ts, which builds the
 * HTML client sites render, uses these same helpers so the editor's live outline and the site's ids always agree.
 */

export type OutlineLevel = 2 | 3;

export interface OutlineHeading {
  /** The `id` the heading carries in `lexicalToHtml`'s output. */
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
  /** Where `@lexical/link`'s LinkNode (this app's editor) keeps a link's address. */
  readonly url?: unknown;
  /** Where Payload's own link node keeps it. Both are read. */
  readonly fields?: { readonly url?: unknown } | null;
}

export function asNodes(value: unknown): readonly LexicalNode[] {
  return Array.isArray(value) ? (value as readonly LexicalNode[]) : [];
}

export function rootOf(document: unknown): LexicalNode | null {
  if (document === null || typeof document !== "object") return null;
  const root = (document as { readonly root?: LexicalNode | null }).root;
  return root === undefined || root === null ? null : root;
}

/** The toolbar makes h2 and h3; anything else is read as h2. */
export function headingLevel(tag: unknown): OutlineLevel {
  return tag === "h3" ? 3 : 2;
}

/** A heading's words as an id: "Opening hours & prices" → "opening-hours-prices". */
function headingSlug(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "section" : slug;
}

/** Hands out one unique id per heading, in document order: a second "Prices" becomes "prices-2". */
export function headingIds(): (text: string) => string {
  const used = new Map<string, number>();
  return (text) => {
    const base = headingSlug(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

/** Mirrors lib/blog-html.ts's renderNode grammar exactly, so the plain text never includes words the HTML leaves
 * out. Block-level nodes end with a space; lexicalToPlainText collapses the runs this leaves. */
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

/** One node's words, whitespace collapsed. */
export function inlineText(node: LexicalNode): string {
  return plainTextOf(node).replace(/\s+/g, " ").trim();
}

/**
 * The post's words with no markup and whitespace collapsed: the source of a default search description
 * (lib/blog-seo.ts) and the editor's word count. Null, undefined and anything not shaped like a Lexical document
 * give "".
 */
export function lexicalToPlainText(document: unknown): string {
  const root = rootOf(document);
  if (root === null) return "";
  return asNodes(root.children).map(plainTextOf).join("").replace(/\s+/g, " ").trim();
}

/**
 * The post's headings in order, with the ids `lexicalToHtml` gives them (so a site can link to them). Only top-level headings count, which is every heading the editor can make. Headings with
 * no words are left out, as `lexicalToHtml` leaves them out.
 */
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
