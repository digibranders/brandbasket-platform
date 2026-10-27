import { META_DESCRIPTION_MAX_LENGTH, META_TITLE_MAX_LENGTH } from "./blog-seo";

/**
 * The post editor's "SEO health": a short checklist a small-business owner can act on, and a score out of 100 that
 * is simply the share of checks passed. It is a writing aid, not a ranking promise, so every check is something the
 * customer can see and change in the editor.
 */

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
  /** 0–100. */
  readonly score: number;
  readonly checks: readonly SeoHealthCheck[];
}

export type SeoHealthGrade = "good" | "fair" | "poor";

export function seoHealth(input: SeoHealthInput): SeoHealth {
  const titleLength = input.searchTitle.trim().length;
  const descriptionLength = input.searchDescription?.trim().length ?? 0;
  const checks: SeoHealthCheck[] = [
    {
      id: "title",
      label: `Search title ${SEARCH_TITLE_MIN_LENGTH}–${META_TITLE_MAX_LENGTH} characters`,
      passed: titleLength >= SEARCH_TITLE_MIN_LENGTH && titleLength <= META_TITLE_MAX_LENGTH,
    },
    {
      id: "description",
      label: `Search description ${SEARCH_DESCRIPTION_MIN_LENGTH}–${META_DESCRIPTION_MAX_LENGTH} characters`,
      passed: descriptionLength >= SEARCH_DESCRIPTION_MIN_LENGTH && descriptionLength <= META_DESCRIPTION_MAX_LENGTH,
    },
    { id: "length", label: `At least ${RECOMMENDED_MIN_WORDS} words`, passed: input.wordCount >= RECOMMENDED_MIN_WORDS },
    { id: "headings", label: "Uses subheadings", passed: input.headingCount > 0 },
    { id: "cover", label: "Has a cover image", passed: input.hasCoverImage },
    { id: "alt", label: "Cover image has alt text", passed: input.hasCoverImage && input.hasCoverAlt },
    {
      id: "address",
      label: "Short web address",
      passed: input.slug.length > 0 && input.slug.length <= ADDRESS_MAX_LENGTH,
    },
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
