import { describe, expect, it } from "vitest";
import { cleanBlogCategoryFields, slugFollowsName, type BlogCategoryFields } from "./blog-category-fields";

function fields(overrides: Partial<BlogCategoryFields> = {}): BlogCategoryFields {
  return { name: "Back Care", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "", ...overrides };
}

describe("cleanBlogCategoryFields", () => {
  it("makes the address from the name while Auto is on, and stores blanks as null", () => {
    expect(cleanBlogCategoryFields(fields({ name: "  Back   Care ", slug: "ignored" }))).toEqual({
      ok: true,
      value: {
        name: "Back Care",
        description: null,
        slug: "back-care",
        slugTyped: false,
        metaTitle: null,
        metaDescription: null,
      },
    });
  });

  it("uses a typed address, tidied, when Auto is off", () => {
    expect(cleanBlogCategoryFields(fields({ slugAuto: false, slug: " Spine Tips " }))).toMatchObject({
      ok: true,
      value: { slug: "spine-tips", slugTyped: true },
    });
  });

  it("falls back to the name when Auto is off but the address is blank", () => {
    expect(cleanBlogCategoryFields(fields({ slugAuto: false, slug: " " }))).toMatchObject({
      value: { slug: "back-care", slugTyped: false },
    });
  });

  it("refuses a missing name and an address with nothing usable", () => {
    expect(cleanBlogCategoryFields(fields({ name: " " }))).toEqual({ ok: false, message: "Give the category a name." });
    expect(cleanBlogCategoryFields(fields({ slugAuto: false, slug: "!!!" }))).toEqual({
      ok: false,
      message: "Use some letters or numbers in the address.",
    });
  });

  it("caps the search description at what Google shows", () => {
    const result = cleanBlogCategoryFields(fields({ metaDescription: "a".repeat(400) }));
    expect(result.ok && result.value.metaDescription?.length).toBe(160);
  });
});

describe("slugFollowsName", () => {
  it("recognises the address Auto gives, numbered or not", () => {
    expect(slugFollowsName("back-care", "Back Care")).toBe(true);
    expect(slugFollowsName("back-care-2", "Back Care")).toBe(true);
    expect(slugFollowsName("spine", "Back Care")).toBe(false);
  });
});
