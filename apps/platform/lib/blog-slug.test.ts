import { describe, expect, it } from "vitest";
import { firstUnusedSlug, isSlugTaken, MAX_SLUG_LENGTH, slugFromInput, slugify, withPreviousSlug } from "./blog-slug";

describe("slugify", () => {
  it("lowercases, strips accents and joins words with dashes", () => {
    expect(slugify("  Café Specials & Offers! ")).toBe("cafe-specials-offers");
  });

  it("returns empty for text with no letters or digits", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("firstUnusedSlug", () => {
  it("keeps the base when it is free", () => {
    expect(firstUnusedSlug("news", new Set())).toBe("news");
  });

  it("numbers from 2 past every taken address", () => {
    expect(firstUnusedSlug("news", new Set(["news", "news-2"]))).toBe("news-3");
  });
});

describe("slugFromInput", () => {
  it("tidies what the customer typed", () => {
    expect(slugFromInput("  Desk Stretches! ", "Five stretches")).toEqual({ ok: true, slug: "desk-stretches" });
  });

  it("falls back to the title when left blank", () => {
    expect(slugFromInput("  ", "Five stretches for desk-bound backs")).toEqual({
      ok: true,
      slug: "five-stretches-for-desk-bound-backs",
    });
  });

  it("refuses an address with nothing usable, or one the website uses itself", () => {
    expect(slugFromInput("!!!", "Title")).toEqual({
      ok: false,
      message: "Use some letters or numbers in the address.",
    });
    expect(slugFromInput("preview", "Title")).toEqual({
      ok: false,
      message: '"preview" is already used by your website. Choose another address.',
    });
  });

  it("caps a very long address at a word boundary", () => {
    const result = slugFromInput("word ".repeat(40), "Title");
    expect(result.ok && result.slug.length <= MAX_SLUG_LENGTH && !result.slug.endsWith("-")).toBe(true);
  });
});

describe("isSlugTaken", () => {
  const others = [
    { slug: "monsoon-menu", previousSlugs: ["old-menu"] },
    { slug: "holiday-hours", previousSlugs: [] },
  ];

  it("is taken by another post's current or earlier address", () => {
    expect(isSlugTaken("monsoon-menu", others)).toBe(true);
    expect(isSlugTaken("old-menu", others)).toBe(true);
  });

  it("is free otherwise", () => {
    expect(isSlugTaken("desk-stretches", others)).toBe(false);
  });
});

describe("withPreviousSlug", () => {
  it("remembers the old address when it changes", () => {
    expect(withPreviousSlug([], "five-stretches", "desk-stretches")).toEqual(["five-stretches"]);
  });

  it("never lists the current address, and never repeats one", () => {
    expect(withPreviousSlug(["desk-stretches", "a"], "a", "desk-stretches")).toEqual(["a"]);
  });

  it("changes nothing when the address stays the same", () => {
    expect(withPreviousSlug(["a"], "b", "b")).toEqual(["a"]);
  });
});
