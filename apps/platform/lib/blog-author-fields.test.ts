import { describe, expect, it } from "vitest";
import { cleanBlogAuthorFields, type BlogAuthorFields } from "./blog-author-fields";

const NO_LINKS = { website: "", instagram: "", facebook: "", linkedin: "", x: "" };

function fields(overrides: Partial<BlogAuthorFields> = {}): BlogAuthorFields {
  return { name: "Asha Rao", role: "", bio: "", links: NO_LINKS, ...overrides };
}

describe("cleanBlogAuthorFields", () => {
  it("trims everything and stores blanks as null", () => {
    expect(cleanBlogAuthorFields(fields({ name: "  Asha   Rao ", role: " ", bio: "" }))).toEqual({
      ok: true,
      value: {
        name: "Asha Rao",
        role: null,
        bio: null,
        links: { website: null, instagram: null, facebook: null, linkedin: null, x: null },
      },
    });
  });

  it("keeps role, bio and links, adding https:// to a bare link", () => {
    const result = cleanBlogAuthorFields(
      fields({ role: "Head physio", bio: "Treats runners.", links: { ...NO_LINKS, instagram: "instagram.com/asha" } }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { role: "Head physio", bio: "Treats runners.", links: { instagram: "https://instagram.com/asha" } },
    });
  });

  it("refuses a missing name and a link that is not a web address, naming the link", () => {
    expect(cleanBlogAuthorFields(fields({ name: "  " }))).toEqual({ ok: false, message: "Give the author a name." });
    expect(cleanBlogAuthorFields(fields({ links: { ...NO_LINKS, facebook: "javascript:alert(1)" } }))).toEqual({
      ok: false,
      message: "The Facebook link isn't a web address. Paste the full link.",
    });
  });

  it("caps the bio at 160 characters", () => {
    const result = cleanBlogAuthorFields(fields({ bio: "a".repeat(300) }));
    expect(result.ok && result.value.bio?.length).toBe(160);
  });
});
