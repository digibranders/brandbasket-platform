import { describe, expect, it } from "vitest";
import { toSitePost } from "./site-post";

const BODY = { root: { children: [{ type: "paragraph", children: [{ type: "text", text: "Hello there" }] }] } };

describe("toSitePost", () => {
  it("keeps every field client sites already read", () => {
    const post = toSitePost({
      slug: "a",
      title: "A",
      excerpt: "",
      publishedAt: "2026-09-24T00:00:00.000Z",
      body: BODY,
      coverImage: { id: 4 },
    });
    expect(post).toMatchObject({
      slug: "a",
      title: "A",
      excerpt: null,
      publishedAt: "2026-09-24T00:00:00.000Z",
      html: "<p>Hello there</p>",
      coverImagePath: "/api/site/media/4",
      categories: [],
    });
  });

  it("sends the category both as the older list of names and as an object", () => {
    const post = toSitePost({ slug: "a", title: "A", category: { id: 3, name: "Recipes", slug: "recipes" } });
    expect(post.categories).toEqual(["Recipes"]);
    expect(post.category).toEqual({
      slug: "recipes",
      name: "Recipes",
      description: null,
      seo: { title: "Recipes", description: null },
    });
  });

  it("has no category when none is set or the relation was not resolved", () => {
    expect(toSitePost({ slug: "a", title: "A" }).category).toBeNull();
    const unresolved = toSitePost({ slug: "a", title: "A", category: 3 });
    expect(unresolved.category).toBeNull();
    expect(unresolved.categories).toEqual([]);
  });

  it("includes the author, with an empty bio as null", () => {
    expect(toSitePost({ slug: "a", title: "A", author: { id: 1, name: "Asha", bio: "" } }).author).toEqual({
      name: "Asha",
      bio: null,
      role: null,
      photoPath: null,
      links: { website: null, instagram: null, facebook: null, linkedin: null, x: null },
    });
    expect(toSitePost({ slug: "a", title: "A" }).author).toBeNull();
  });

  it("resolves search settings with their defaults", () => {
    expect(toSitePost({ slug: "a", title: "A", body: BODY, noIndex: true }).seo).toEqual({
      title: "A",
      description: "Hello there",
      noIndex: true,
    });
    expect(
      toSitePost({ slug: "a", title: "A", metaTitle: "Custom", metaDescription: "Typed", noIndex: null }).seo,
    ).toEqual({ title: "Custom", description: "Typed", noIndex: false });
  });

  it("sends where the article lives, defaulting to blog", () => {
    expect(toSitePost({ slug: "a", title: "A" }).pathPrefix).toBe("blog");
    expect(toSitePost({ slug: "a", title: "A", pathPrefix: "tips" }).pathPrefix).toBe("tips");
    expect(toSitePost({ slug: "a", title: "A", pathPrefix: "api" }).pathPrefix).toBe("blog");
    expect(toSitePost({ slug: "a", title: "A", pathPrefix: "" }).pathPrefix).toBe("");
  });

  it("sends the article's earlier addresses, keeping only strings", () => {
    expect(toSitePost({ slug: "a", title: "A" }).previousSlugs).toEqual([]);
    expect(toSitePost({ slug: "a", title: "A", previousSlugs: ["old", 3] }).previousSlugs).toEqual(["old"]);
  });

  it("passes updatedAt through", () => {
    expect(toSitePost({ slug: "a", title: "A", updatedAt: "2026-09-24T10:00:00.000Z" }).updatedAt).toBe(
      "2026-09-24T10:00:00.000Z",
    );
  });

  it("sends the cover image's alt text, with blank as null", () => {
    expect(toSitePost({ slug: "a", title: "A", coverImageAlt: "A bowl of dal" }).coverImageAlt).toBe("A bowl of dal");
    expect(toSitePost({ slug: "a", title: "A", coverImageAlt: " " }).coverImageAlt).toBeNull();
  });

  it("sends the author's role, photo and links", () => {
    const author = toSitePost({
      slug: "a",
      title: "A",
      author: { id: 1, name: "Asha", role: "Head chef", photo: 9, instagram: "https://instagram.com/asha" },
    }).author;
    expect(author).toMatchObject({
      role: "Head chef",
      photoPath: "/api/site/media/9",
      links: { instagram: "https://instagram.com/asha", website: null },
    });
  });

  it("sends the category's description and search text, falling back to its name and description", () => {
    const category = toSitePost({
      slug: "a",
      title: "A",
      category: { id: 3, name: "Recipes", slug: "recipes", description: "Home cooking.", metaTitle: "Recipes | Aster" },
    }).category;
    expect(category).toMatchObject({
      description: "Home cooking.",
      seo: { title: "Recipes | Aster", description: "Home cooking." },
    });
  });
});
