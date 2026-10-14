import { describe, expect, it } from "vitest";
import { formatArticleAddress, parseArticleAddress, storedPostPath } from "./post-path";

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
