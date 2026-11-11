/**
 * A post's search title and description, and the editor's "SEO health" checklist. Ported from apps/platform
 * lib/blog-seo.ts and lib/blog-seo-health.ts. The defaults here match what the platform's site API serves client sites.
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

/** Title: the typed search title, else the post title. Description: typed, else the summary, else the body cut at a word. */
export function resolveSeo(source: SeoSource): ResolvedSeo {
  const bodyText = present(source.bodyText);
  return {
    title: present(source.metaTitle) ?? source.title,
    description:
      present(source.metaDescription) ?? present(source.excerpt) ?? (bodyText === null ? null : truncateAtWord(bodyText, META_DESCRIPTION_MAX_LENGTH)),
    noIndex: source.noIndex,
  };
}

const SEARCH_TITLE_MIN_LENGTH = 30;
const SEARCH_DESCRIPTION_MIN_LENGTH = 70;
const RECOMMENDED_MIN_WORDS = 300;
/** Past this an address gets hard to read and share. */
const ADDRESS_MAX_LENGTH = 60;

export interface SeoHealthInput {
  /** The search title as it will be shown: typed, or the post title. */
  readonly searchTitle: string;
  /** The search description as it will be shown, or null when there is none at all. */
  readonly searchDescription: string | null;
  readonly slug: string;
  readonly wordCount: number;
  readonly headingCount: number;
  readonly hasCoverImage: boolean;
  readonly hasCoverAlt: boolean;
  readonly hasCategory: boolean;
  readonly indexable: boolean;
}

export interface SeoHealthCheck {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
}

export interface SeoHealth {
  /** 0 to 100: the share of checks passed. */
  readonly score: number;
  readonly checks: readonly SeoHealthCheck[];
}

export type SeoHealthGrade = "good" | "fair" | "poor";

/**
 * A short checklist a small-business owner can act on, and a score that is simply the share of checks passed. A writing
 * aid, not a ranking promise: every check is something the customer can see and change in the editor.
 */
export function seoHealth(input: SeoHealthInput): SeoHealth {
  const titleLength = input.searchTitle.trim().length;
  const descriptionLength = input.searchDescription?.trim().length ?? 0;
  const checks: SeoHealthCheck[] = [
    {
      id: "title",
      label: `Search title ${SEARCH_TITLE_MIN_LENGTH} to ${META_TITLE_MAX_LENGTH} characters`,
      passed: titleLength >= SEARCH_TITLE_MIN_LENGTH && titleLength <= META_TITLE_MAX_LENGTH,
    },
    {
      id: "description",
      label: `Search description ${SEARCH_DESCRIPTION_MIN_LENGTH} to ${META_DESCRIPTION_MAX_LENGTH} characters`,
      passed: descriptionLength >= SEARCH_DESCRIPTION_MIN_LENGTH && descriptionLength <= META_DESCRIPTION_MAX_LENGTH,
    },
    { id: "length", label: `At least ${RECOMMENDED_MIN_WORDS} words`, passed: input.wordCount >= RECOMMENDED_MIN_WORDS },
    { id: "headings", label: "Uses subheadings", passed: input.headingCount > 0 },
    { id: "cover", label: "Has a cover image", passed: input.hasCoverImage },
    { id: "alt", label: "Cover image has alt text", passed: input.hasCoverImage && input.hasCoverAlt },
    { id: "address", label: "Short web address", passed: input.slug.length > 0 && input.slug.length <= ADDRESS_MAX_LENGTH },
    { id: "category", label: "Has a category", passed: input.hasCategory },
    { id: "indexable", label: "Visible on Google", passed: input.indexable },
  ];
  const passed = checks.filter((check) => check.passed).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}

export function seoHealthGrade(score: number): SeoHealthGrade {
  if (score >= 80) return "good";
  if (score >= 50) return "fair";
  return "poor";
}
