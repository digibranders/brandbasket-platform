import { describe, expect, it, vi } from "vitest";
import { BlogOwnershipError, ownedOrNull, readBlogPost, readBlogPosts, requireOwnedBlogPost, requireOwnedTaxonomyDoc, unusedPostSlug } from "./store";

const MINE = "0192f3c4-1111-7000-8000-000000000001";
const THEIRS = "0192f3c4-2222-7000-8000-000000000002";
const NOW = new Date("2026-11-03T10:00:00.000Z");

/** Payload's NotFound is an APIError with status 404. */
function notFoundError(): Error {
  return Object.assign(new Error("Not Found"), { status: 404 });
}

function payloadWith(overrides: Record<string, unknown>) {
  return { findByID: vi.fn(), find: vi.fn(), count: vi.fn(), ...overrides } as never;
}

describe("the ownership checks", () => {
  it("refuse a post of another business", async () => {
    const payload = payloadWith({ findByID: vi.fn().mockResolvedValue({ id: 7, businessId: THEIRS, slug: "x", status: "draft" }) });
    await expect(requireOwnedBlogPost(payload, "7", MINE)).rejects.toBeInstanceOf(BlogOwnershipError);
  });

  it("refuse a category or author of another business", async () => {
    const payload = payloadWith({ findByID: vi.fn().mockResolvedValue({ id: 3, businessId: THEIRS }) });
    await expect(requireOwnedTaxonomyDoc(payload, "blogCategories", "3", MINE)).rejects.toBeInstanceOf(BlogOwnershipError);
  });

  it("return the business's own post with its address history", async () => {
    const payload = payloadWith({ findByID: vi.fn().mockResolvedValue({ id: 7, businessId: MINE, slug: "now", previousSlugs: ["then", 4], status: "published", publishedAt: "2026-10-01T00:00:00.000Z" }) });
    expect(await requireOwnedBlogPost(payload, "7", MINE)).toMatchObject({ id: "7", slug: "now", previousSlugs: ["then"], status: "published", publishedAt: "2026-10-01T00:00:00.000Z" });
  });

  it("answer a missing id and another business's id alike, and let any other failure through", async () => {
    expect(await ownedOrNull(() => Promise.reject(notFoundError()))).toBeNull();
    expect(await ownedOrNull(() => Promise.reject(new BlogOwnershipError("blogPosts", "7")))).toBeNull();
    await expect(ownedOrNull(() => Promise.reject(new Error("connection reset")))).rejects.toThrow("connection reset");
  });
});

describe("readBlogPost", () => {
  it("is null for another business's post, so the page answers the same 404", async () => {
    const payload = payloadWith({ findByID: vi.fn().mockResolvedValue({ id: 7, businessId: THEIRS, title: "Secret" }) });
    expect(await readBlogPost(payload, MINE, "7", NOW)).toBeNull();
  });

  it("shapes the business's own post, with the media route for its cover", async () => {
    const payload = payloadWith({
      findByID: vi.fn().mockResolvedValue({
        id: 7,
        businessId: MINE,
        title: "Monsoon menu",
        slug: "monsoon-menu",
        status: "published",
        publishedAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        coverImage: { id: 12 },
        category: { id: 3, name: "Menus" },
        pathPrefix: "api",
      }),
    });
    expect(await readBlogPost(payload, MINE, "7", NOW)).toMatchObject({
      id: "7",
      publishState: "scheduled",
      coverImage: { id: "12", url: "/website/blog/media/12" },
      categoryId: "3",
      categoryName: "Menus",
      pathPrefix: "blog",
      coverImageAlt: "",
      noIndex: false,
    });
  });

  it("lets a failed read through, so the page shows an error instead of a 404", async () => {
    const payload = payloadWith({ findByID: vi.fn().mockRejectedValue(new Error("timeout")) });
    await expect(readBlogPost(payload, MINE, "7", NOW)).rejects.toThrow("timeout");
  });
});

describe("readBlogPosts", () => {
  it("asks for the business's posts only, newest edited first, at most 200, and drops anything else that comes back", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        { id: 1, businessId: MINE, title: "Mine", status: "draft", updatedAt: "2026-11-01T00:00:00.000Z" },
        { id: 2, businessId: THEIRS, title: "Theirs", status: "draft", updatedAt: "2026-11-01T00:00:00.000Z" },
      ],
    });
    const posts = await readBlogPosts(payloadWith({ find }), MINE, NOW);
    expect(posts.map((post) => post.title)).toEqual(["Mine"]);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: { equals: MINE } }, sort: "-updatedAt", limit: 200, overrideAccess: true }));
  });
});

describe("unusedPostSlug", () => {
  it("numbers past the business's own addresses and the website's reserved ones", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1, businessId: MINE, slug: "news" }, { id: 2, businessId: MINE, slug: "news-2" }, { id: 3, businessId: THEIRS, slug: "news-3" }] });
    expect(await unusedPostSlug(payloadWith({ find }), MINE, "news")).toBe("news-3");
    expect(await unusedPostSlug(payloadWith({ find: vi.fn().mockResolvedValue({ docs: [] }) }), MINE, "preview")).toBe("preview-2");
  });
});
