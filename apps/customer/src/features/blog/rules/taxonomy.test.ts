import { describe, expect, it } from "vitest";
import {
  cleanBlogAuthorFields,
  cleanBlogCategoryFields,
  parseAuthorLink,
  sameName,
  slugFollowsName,
  type BlogAuthorFields,
  type BlogCategoryFields,
} from "./taxonomy";

describe("parseAuthorLink", () => {
  it("treats blank as no link", () => {
    expect(parseAuthorLink("  ")).toEqual({ ok: true, value: null });
  });

  it("adds https:// when it is missing", () => {
    expect(parseAuthorLink("instagram.com/asha")).toEqual({ ok: true, value: "https://instagram.com/asha" });
    expect(parseAuthorLink("www.x.com/asha")).toEqual({ ok: true, value: "https://www.x.com/asha" });
  });

  it("keeps a full http(s) address", () => {
    expect(parseAuthorLink("https://asterphysio.com/")).toEqual({ ok: true, value: "https://asterphysio.com/" });
  });

  it("refuses anything that is not a web address", () => {
    expect(parseAuthorLink("javascript:alert(1)").ok).toBe(false);
    expect(parseAuthorLink("mailto:a@b.com").ok).toBe(false);
    expect(parseAuthorLink("asha").ok).toBe(false);
    expect(parseAuthorLink("my site.com").ok).toBe(false);
    expect(parseAuthorLink(`https://a.com/${"x".repeat(300)}`).ok).toBe(false);
  });
});

const NO_LINKS = { website: "", instagram: "", facebook: "", linkedin: "", x: "" };

function author(overrides: Partial<BlogAuthorFields> = {}): BlogAuthorFields {
  return { name: "Asha Rao", role: "", bio: "", links: NO_LINKS, ...overrides };
}

describe("cleanBlogAuthorFields", () => {
  it("trims everything and stores blanks as null", () => {
    expect(cleanBlogAuthorFields(author({ name: "  Asha   Rao ", role: " ", bio: "" }))).toEqual({
      ok: true,
      value: { name: "Asha Rao", role: null, bio: null, links: { website: null, instagram: null, facebook: null, linkedin: null, x: null } },
    });
  });

  it("keeps role, bio and links, adding https:// to a bare link", () => {
    const result = cleanBlogAuthorFields(author({ role: "Head physio", bio: "Treats runners.", links: { ...NO_LINKS, instagram: "instagram.com/asha" } }));
    expect(result).toMatchObject({ ok: true, value: { role: "Head physio", bio: "Treats runners.", links: { instagram: "https://instagram.com/asha" } } });
  });

  it("refuses a missing name and a link that is not a web address, naming the field", () => {
    expect(cleanBlogAuthorFields(author({ name: "  " }))).toEqual({ ok: false, field: "name", message: "Give the author a name." });
    expect(cleanBlogAuthorFields(author({ links: { ...NO_LINKS, facebook: "javascript:alert(1)" } }))).toEqual({
      ok: false,
      field: "facebook",
      message: "The Facebook link isn't a web address. Paste the full link.",
    });
  });

  it("caps the name at 60, the role at 80 and the bio at 160 characters", () => {
    const result = cleanBlogAuthorFields(author({ name: "n".repeat(90), role: "r".repeat(90), bio: "a".repeat(300) }));
    expect(result.ok && [result.value.name.length, result.value.role?.length, result.value.bio?.length]).toEqual([60, 80, 160]);
  });
});

function category(overrides: Partial<BlogCategoryFields> = {}): BlogCategoryFields {
  return { name: "Back Care", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "", ...overrides };
}

describe("cleanBlogCategoryFields", () => {
  it("makes the address from the name while Auto is on, and stores blanks as null", () => {
    expect(cleanBlogCategoryFields(category({ name: "  Back   Care ", slug: "ignored" }))).toEqual({
      ok: true,
      value: { name: "Back Care", description: null, slug: "back-care", slugTyped: false, metaTitle: null, metaDescription: null },
    });
  });

  it("uses a typed address, tidied, when Auto is off", () => {
    expect(cleanBlogCategoryFields(category({ slugAuto: false, slug: " Spine Tips " }))).toMatchObject({ ok: true, value: { slug: "spine-tips", slugTyped: true } });
  });

  it("falls back to the name when Auto is off but the address is blank", () => {
    expect(cleanBlogCategoryFields(category({ slugAuto: false, slug: " " }))).toMatchObject({ value: { slug: "back-care", slugTyped: false } });
  });

  it("refuses a missing name and an address with nothing usable", () => {
    expect(cleanBlogCategoryFields(category({ name: " " }))).toEqual({ ok: false, field: "name", message: "Give the category a name." });
    expect(cleanBlogCategoryFields(category({ slugAuto: false, slug: "!!!" }))).toEqual({ ok: false, field: "slug", message: "Use some letters or numbers in the address." });
    expect(cleanBlogCategoryFields(category({ name: "!!!" }))).toEqual({ ok: false, field: "name", message: "Use some letters or numbers in the name." });
  });

  it("caps the description at 300 and the search description at what Google shows", () => {
    const result = cleanBlogCategoryFields(category({ description: "d".repeat(400), metaDescription: "a".repeat(400) }));
    expect(result.ok && [result.value.description?.length, result.value.metaDescription?.length]).toEqual([300, 160]);
  });
});

describe("slugFollowsName", () => {
  it("recognises the address Auto gives, numbered or not", () => {
    expect(slugFollowsName("back-care", "Back Care")).toBe(true);
    expect(slugFollowsName("back-care-2", "Back Care")).toBe(true);
    expect(slugFollowsName("spine", "Back Care")).toBe(false);
  });
});

describe("sameName", () => {
  it("ignores case and refuses anything that is not text", () => {
    expect(sameName("Back care", "BACK CARE")).toBe(true);
    expect(sameName(null, "Back care")).toBe(false);
  });
});
