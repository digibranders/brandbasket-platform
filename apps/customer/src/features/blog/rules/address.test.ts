import { describe, expect, it } from "vitest";
import { firstUnusedSlug, formatArticleAddress, isSlugTaken, MAX_SLUG_LENGTH, parseArticleAddress, shownAddress, siteHost, slugFromInput, slugify, storedPostPath, withPreviousSlug } from "./address";

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

const TITLE = "Five stretches for desk-bound backs";

describe("parseArticleAddress", () => {
  it("reads a prefix and an address", () => {
    expect(parseArticleAddress("geo/article-1", TITLE)).toEqual({ ok: true, pathPrefix: "geo", slug: "article-1" });
  });

  it("reads an address on its own as an article at the root of the site", () => {
    expect(parseArticleAddress("article-1", TITLE)).toEqual({ ok: true, pathPrefix: "", slug: "article-1" });
  });

  it("tidies what people type: case, spaces, stray slashes", () => {
    expect(parseArticleAddress(" /Health Tips/Desk Stretches/ ", TITLE)).toEqual({
      ok: true,
      pathPrefix: "health-tips",
      slug: "desk-stretches",
    });
  });

  it("uses the default when left blank: blog, and an address from the title", () => {
    expect(parseArticleAddress("  ", TITLE)).toEqual({
      ok: true,
      pathPrefix: "blog",
      slug: "five-stretches-for-desk-bound-backs",
    });
  });

  it("makes the address from the title when only a prefix is given", () => {
    expect(parseArticleAddress("geo/", TITLE)).toEqual({
      ok: true,
      pathPrefix: "geo",
      slug: "five-stretches-for-desk-bound-backs",
    });
  });

  it("refuses more than one /", () => {
    expect(parseArticleAddress("a/b/c", TITLE)).toEqual({
      ok: false,
      message: 'Use at most one "/", like geo/your-article, or just your-article.',
    });
  });

  it.each(["blog", "about", "contact", "api"])("refuses %s at the root, which the website itself uses", (value) => {
    expect(parseArticleAddress(value, TITLE)).toEqual({
      ok: false,
      message: `"${value}" is already a page on your website. Put the article under a word, like tips/${value}.`,
    });
  });

  it.each(["api/x", "category/x", "preview/x"])("refuses %s, whose first word the website uses", (value) => {
    expect(parseArticleAddress(value, TITLE).ok).toBe(false);
  });

  it("refuses an address with nothing usable", () => {
    expect(parseArticleAddress("geo/!!!", TITLE).ok).toBe(false);
  });
});

describe("storedPostPath", () => {
  it("is blog for a post that never chose one, and for a stored value that is no longer valid", () => {
    expect(storedPostPath(undefined)).toBe("blog");
    expect(storedPostPath(null)).toBe("blog");
    expect(storedPostPath("api")).toBe("blog");
  });

  it("keeps a chosen prefix, and the empty prefix of an article at the root", () => {
    expect(storedPostPath("tips")).toBe("tips");
    expect(storedPostPath("")).toBe("");
  });
});

describe("formatArticleAddress", () => {
  it("writes the address as the customer sees it in the box", () => {
    expect(formatArticleAddress("geo", "article-1")).toBe("geo/article-1");
    expect(formatArticleAddress("", "article-1")).toBe("article-1");
  });
});

describe("shownAddress", () => {
  it("shows the default from the title while the box is blank", () => {
    expect(shownAddress(" ", TITLE)).toBe("blog/five-stretches-for-desk-bound-backs");
  });

  it("tidies a typed prefix and address the way Save does", () => {
    expect(shownAddress("Health Tips/Desk Stretches", TITLE)).toBe("health-tips/desk-stretches");
    expect(shownAddress("geo/", TITLE)).toBe("geo/five-stretches-for-desk-bound-backs");
    expect(shownAddress("article-1", TITLE)).toBe("article-1");
  });
});

describe("siteHost", () => {
  it("drops the scheme and www", () => {
    expect(siteHost("https://www.asterphysio.com")).toBe("asterphysio.com");
  });

  it("is null for none and for an unreadable address", () => {
    expect(siteHost(null)).toBeNull();
    expect(siteHost("not a url")).toBeNull();
  });
});
