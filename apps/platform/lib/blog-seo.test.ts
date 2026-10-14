import { describe, expect, it } from "vitest";
import { META_DESCRIPTION_MAX_LENGTH, resolveSeo, truncateAtWord, type SeoSource } from "./blog-seo";

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
