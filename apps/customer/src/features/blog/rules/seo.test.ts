import { describe, expect, it } from "vitest";
import { META_DESCRIPTION_MAX_LENGTH, resolveSeo, seoHealth, seoHealthGrade, truncateAtWord, type SeoHealthInput, type SeoSource } from "./seo";

const BASE: SeoSource = {
  title: "Monsoon menu",
  excerpt: null,
  bodyText: "",
  metaTitle: null,
  metaDescription: null,
  noIndex: false,
};

describe("truncateAtWord", () => {
  it("leaves short text alone", () => {
    expect(truncateAtWord("Fresh bread", 20)).toBe("Fresh bread");
  });

  it("cuts at the last whole word and adds an ellipsis", () => {
    expect(truncateAtWord("Fresh bread every single morning", 20)).toBe("Fresh bread every…");
  });
});

describe("resolveSeo", () => {
  it("defaults the title to the post title", () => {
    expect(resolveSeo(BASE).title).toBe("Monsoon menu");
  });

  it("prefers the meta title when set", () => {
    expect(resolveSeo({ ...BASE, metaTitle: "Monsoon menu 2026 | Cafe" }).title).toBe("Monsoon menu 2026 | Cafe");
  });

  it("treats a blank meta title as unset", () => {
    expect(resolveSeo({ ...BASE, metaTitle: "   " }).title).toBe("Monsoon menu");
  });

  it("uses the meta description, then the excerpt, then the body text", () => {
    expect(resolveSeo({ ...BASE, metaDescription: "M", excerpt: "E", bodyText: "B" }).description).toBe("M");
    expect(resolveSeo({ ...BASE, excerpt: "E", bodyText: "B" }).description).toBe("E");
    expect(resolveSeo({ ...BASE, bodyText: "B" }).description).toBe("B");
  });

  it("gives no description when there is no text anywhere", () => {
    expect(resolveSeo(BASE).description).toBeNull();
  });

  it("caps a description taken from the body", () => {
    const description = resolveSeo({ ...BASE, bodyText: "word ".repeat(100) }).description;
    expect(description).not.toBeNull();
    expect(description!.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
  });

  it("passes noIndex through", () => {
    expect(resolveSeo({ ...BASE, noIndex: true }).noIndex).toBe(true);
  });
});

const HEALTHY: SeoHealthInput = {
  searchTitle: "Five stretches for desk-bound backs | Aster Physio",
  searchDescription:
    "Sitting all day tightens the same muscles. These five stretches take ten minutes and need no equipment at all.",
  slug: "five-stretches-for-desk-bound-backs",
  wordCount: 640,
  headingCount: 3,
  hasCoverImage: true,
  hasCoverAlt: true,
  hasCategory: true,
  indexable: true,
};

function failed(input: SeoHealthInput): readonly string[] {
  return seoHealth(input)
    .checks.filter((check) => !check.passed)
    .map((check) => check.id);
}

describe("seoHealth", () => {
  it("scores a complete post 100", () => {
    expect(seoHealth(HEALTHY).score).toBe(100);
  });

  it("flags a short title and a missing description", () => {
    expect(failed({ ...HEALTHY, searchTitle: "Stretches", searchDescription: null })).toEqual(["title", "description"]);
  });

  it("flags a title longer than search engines show", () => {
    expect(failed({ ...HEALTHY, searchTitle: "x".repeat(71) })).toEqual(["title"]);
  });

  it("does not pass alt text for a post with no cover image", () => {
    expect(failed({ ...HEALTHY, hasCoverImage: false, hasCoverAlt: true })).toEqual(["cover", "alt"]);
  });

  it("flags thin posts, no subheadings, a long address, no category and a hidden post", () => {
    expect(
      failed({ ...HEALTHY, wordCount: 120, headingCount: 0, slug: "a".repeat(61), hasCategory: false, indexable: false }),
    ).toEqual(["length", "headings", "address", "category", "indexable"]);
  });

  it("scores the share of checks passed", () => {
    // Nine checks; the empty post passes only "visible to search engines".
    const empty = seoHealth({
      searchTitle: "",
      searchDescription: null,
      slug: "",
      wordCount: 0,
      headingCount: 0,
      hasCoverImage: false,
      hasCoverAlt: false,
      hasCategory: false,
      indexable: true,
    });
    expect(empty.score).toBe(11);
  });
});

describe("seoHealthGrade", () => {
  it("grades by score", () => {
    expect(seoHealthGrade(100)).toBe("good");
    expect(seoHealthGrade(80)).toBe("good");
    expect(seoHealthGrade(79)).toBe("fair");
    expect(seoHealthGrade(50)).toBe("fair");
    expect(seoHealthGrade(49)).toBe("poor");
  });
});
