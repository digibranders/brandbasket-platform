/**
 * A post's search-engine title and description: what the customer typed, or a sensible default. Resolved on the
 * platform (lib/site-post.ts) so every client site shows the same thing without its own copy of these rules.
 */

/** Roughly what Google shows before cutting a title off. The editor warns past it; nothing is truncated. */
export const META_TITLE_MAX_LENGTH = 70;
/** Roughly what Google shows of a description. A typed description is capped at this when saved. */
export const META_DESCRIPTION_MAX_LENGTH = 160;

export interface SeoSource {
  readonly title: string;
  readonly excerpt: string | null;
  /** The body as plain text (lexicalToPlainText). */
  readonly bodyText: string;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly noIndex: boolean;
}

export interface ResolvedSeo {
  readonly title: string;
  readonly description: string | null;
  readonly noIndex: boolean;
}

/** `text` whole, or cut at the last space that fits within `max` characters, ellipsis included. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  return `${(lastSpace > 0 ? room.slice(0, lastSpace) : room).trimEnd()}…`;
}

function present(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function resolveSeo(source: SeoSource): ResolvedSeo {
  const bodyText = present(source.bodyText);
  return {
    title: present(source.metaTitle) ?? source.title,
    description:
      present(source.metaDescription) ??
      present(source.excerpt) ??
      (bodyText === null ? null : truncateAtWord(bodyText, META_DESCRIPTION_MAX_LENGTH)),
    noIndex: source.noIndex,
  };
}
