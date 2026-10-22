import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingRequiredError, requireWebsiteAccess, WebsiteRequiredError } from "@/lib/server/billing";
import {
  createBlogPostAction,
  deleteBlogPostAction,
  duplicateBlogPostAction,
  removeCoverImageAction,
  publishBlogPostAction,
  setCoverImageAction,
  unlockBlogPostsAction,
  unpublishBlogPostAction,
  updateBlogPostAction,
  type BlogPostFields,
} from "./actions";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import { getBlogUsage } from "@/lib/server/blog-allowance";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { openBlogUnlock, startCustomerChargePayment } from "@/lib/server/charges";
import { redirect } from "next/navigation";

/*
 * Same "mocked Payload client, real logic" pattern as `content/gallery-actions.test.ts`: `lib/server/blog.ts`'s
 * `requireOwnedBlogPost`/`BlogPostOwnershipError` run for real — they're the whole defense against a client-
 * supplied `postId` naming another business's real post, now that there is no multi-tenant plugin behind them (see
 * this plan's "Architecture, corrected" note). Only Payload itself is a hand-built test double.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({
  requireWebsiteAccess: vi.fn(),
  BillingRequiredError: class BillingRequiredError extends Error {
    readonly businessId: string;
    constructor(businessId: string) {
      super(`Business ${businessId} has no paid subscription, so this action is not available.`);
      this.name = "BillingRequiredError";
      this.businessId = businessId;
    }
  },
  WebsiteRequiredError: class WebsiteRequiredError extends Error {
    readonly businessId: string;
    constructor(businessId: string) {
      super(`Business ${businessId} has no Managed Website service, so this action is not available.`);
      this.name = "WebsiteRequiredError";
      this.businessId = businessId;
    }
  },
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/blog-allowance", () => ({
  getBlogUsage: vi.fn(async () => null),
  isAtBlogLimit: (usage: { used: number; allowance: number } | null) => usage !== null && usage.used >= usage.allowance,
}));
vi.mock("@/lib/server/charges", () => ({ openBlogUnlock: vi.fn(), startCustomerChargePayment: vi.fn() }));
vi.mock("@/lib/server/charge-redirect", () => ({ redirectForChargePayment: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));

const { FakeNotFound, store, findByID, find, create, update, deleteDoc, resetStore } = vi.hoisted(() => {
  class FakeNotFound extends Error {
    constructor() {
      super("Not Found.");
      this.name = "NotFound";
    }
  }

  type Doc = Record<string, unknown> & { readonly id: string };
  const store: Record<string, Map<string, Doc>> = {
    blogPosts: new Map(),
    media: new Map(),
    blogCategories: new Map(),
    blogAuthors: new Map(),
  };

  function resetStore(): void {
    store.blogPosts = new Map();
    store.media = new Map();
    store.blogCategories = new Map();
    store.blogAuthors = new Map();
  }

  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
    const doc = store[collection]?.get(String(id));
    if (doc === undefined) throw new FakeNotFound();
    return doc;
  });

  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: Array.from(store[collection]?.values() ?? []),
  }));

  let nextId = 1;
  const create = vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
    const id = String(nextId++);
    const doc: Doc = { id, ...data };
    store[collection]!.set(id, doc);
    return doc;
  });

  const update = vi.fn(
    async ({ collection, id, data }: { collection: string; id: string | number; data: Record<string, unknown> }) => {
      const doc = store[collection]?.get(String(id));
      if (doc === undefined) throw new FakeNotFound();
      const updated = { ...doc, ...data };
      store[collection]!.set(String(id), updated);
      return updated;
    },
  );

  const deleteDoc = vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
    const existed = store[collection]?.delete(String(id)) ?? false;
    if (!existed) throw new FakeNotFound();
    return { id };
  });

  return { FakeNotFound, store, findByID, find, create, update, deleteDoc, resetStore };
});

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ findByID, find, create, update, delete: deleteDoc })),
  NotFound: FakeNotFound,
}));

const mockedRequireWebsiteAccess = vi.mocked(requireWebsiteAccess);

const BUSINESS_A = "0192f3c4-aaaa-7000-8000-00000000000a";
const BUSINESS_B = "0192f3c4-bbbb-7000-8000-00000000000b";
const POST_A_ID = "post-a";
const POST_B_ID = "post-b";

function tenantFor(businessId: string) {
  return { user: { id: "user-1" }, tenant: { userId: "user-1", businessId }, billing: { hasAccess: true } } as never;
}

const VALID_BODY_JSON = JSON.stringify({ root: { type: "root", children: [] } });

/** What the edit form sends: nothing chosen and every search field blank, unless a test says otherwise. */
function fields(overrides: Partial<BlogPostFields> = {}): BlogPostFields {
  return {
    title: "New title",
    excerpt: "",
    bodyJson: VALID_BODY_JSON,
    categoryId: "",
    authorId: "",
    metaTitle: "",
    metaDescription: "",
    noIndex: false,
    address: "blog/old-title",
    coverImageAlt: "",
    publishedAt: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  store.media.set("media-a1", { id: "media-a1", businessId: BUSINESS_A });
  store.media.set("media-b1", { id: "media-b1", businessId: BUSINESS_B });
  store.blogCategories.set("cat-a", { id: "cat-a", businessId: BUSINESS_A, name: "Recipes", slug: "recipes" });
  store.blogCategories.set("cat-b", { id: "cat-b", businessId: BUSINESS_B, name: "News", slug: "news" });
  store.blogAuthors.set("author-a", { id: "author-a", businessId: BUSINESS_A, name: "Asha", bio: null });
  store.blogAuthors.set("author-b", { id: "author-b", businessId: BUSINESS_B, name: "Ben", bio: null });
  store.blogPosts.set(POST_A_ID, {
    id: POST_A_ID,
    businessId: BUSINESS_A,
    title: "Old title",
    slug: "old-title",
    excerpt: "Old excerpt",
    body: { root: { type: "root", children: [] } },
    status: "draft",
    coverImage: null,
  });
  store.blogPosts.set(POST_B_ID, {
    id: POST_B_ID,
    businessId: BUSINESS_B,
    title: "Business B's post",
    slug: "business-bs-post",
    excerpt: null,
    body: { root: { type: "root", children: [] } },
    status: "draft",
    coverImage: null,
  });
});

const USAGE_AT_LIMIT = { used: 100, allowance: 100, nextBlock: { posts: 100, price: "₹560.50" } };

describe("the blog post limit", () => {
  it("refuses a new post once every allowed post is used, creating nothing", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    vi.mocked(getBlogUsage).mockResolvedValueOnce(USAGE_AT_LIMIT);
    const formData = new FormData();
    formData.set("title", "One too many");

    const result = await createBlogPostAction({ ok: true }, formData);

    expect(result).toEqual({
      ok: false,
      message: "You’ve used all 100 of your blog posts. Unlock 100 more from your blog page.",
    });
    expect(Array.from(store.blogPosts.values()).some((doc) => doc.title === "One too many")).toBe(false);
  });

  it("opens the unlock at the plan's price and sends the customer to pay it", async () => {
    const access = { ...(tenantFor(BUSINESS_A) as object), billing: { hasAccess: true, plan: { id: "plan" } } } as never;
    mockedRequireWebsiteAccess.mockResolvedValue(access);
    vi.mocked(getBlogUsage).mockResolvedValueOnce(USAGE_AT_LIMIT);
    vi.mocked(openBlogUnlock).mockResolvedValueOnce({ id: "charge-1" } as never);
    vi.mocked(startCustomerChargePayment).mockResolvedValueOnce({ kind: "redirect", url: "/pay" });

    await unlockBlogPostsAction();

    expect(openBlogUnlock).toHaveBeenCalledWith(expect.objectContaining({ businessId: BUSINESS_A }), { id: "plan" });
    expect(startCustomerChargePayment).toHaveBeenCalledWith(access, "charge-1");
    expect(redirectForChargePayment).toHaveBeenCalledWith({ kind: "redirect", url: "/pay" });
  });

  it("sells no block to a customer who still has posts left", async () => {
    const access = { ...(tenantFor(BUSINESS_A) as object), billing: { hasAccess: true, plan: { id: "plan" } } } as never;
    mockedRequireWebsiteAccess.mockResolvedValue(access);
    vi.mocked(getBlogUsage).mockResolvedValueOnce({ ...USAGE_AT_LIMIT, used: 12 });
    vi.mocked(redirect).mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(unlockBlogPostsAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/content/blog");
    expect(openBlogUnlock).not.toHaveBeenCalled();
  });
});

describe("createBlogPostAction", () => {
  it("creates a draft post scoped to the caller's own business", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const formData = new FormData();
    formData.set("title", "My New Post");

    await createBlogPostAction({ ok: true }, formData);

    const created = Array.from(store.blogPosts.values()).find((doc) => doc.title === "My New Post");
    expect(created).toBeDefined();
    expect(created?.businessId).toBe(BUSINESS_A);
    expect(created?.status).toBe("draft");
    expect(created?.slug).toBe("my-new-post");
  });

  it("never gives a post the address a category page uses", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const formData = new FormData();
    formData.set("title", "Category");

    await createBlogPostAction({ ok: true }, formData);

    const created = Array.from(store.blogPosts.values()).find((doc) => doc.title === "Category");
    expect(created?.slug).toBe("category-2");
  });

  it("gives a post whose title another of the business's posts already uses its own address", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const formData = new FormData();
    formData.set("title", "Old title");
    await createBlogPostAction({ ok: true }, formData);
    await createBlogPostAction({ ok: true }, formData);

    const slugs = Array.from(store.blogPosts.values())
      .filter((doc) => doc.businessId === BUSINESS_A)
      .map((doc) => doc.slug)
      .sort();
    expect(slugs).toEqual(["old-title", "old-title-2", "old-title-3"]);
  });

  it("never gives a post the address a client site uses for its preview page", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const formData = new FormData();
    formData.set("title", "Preview");

    await createBlogPostAction({ ok: true }, formData);

    const created = Array.from(store.blogPosts.values()).find((doc) => doc.title === "Preview");
    expect(created?.slug).toBe("preview-2");
  });

  it("does not count another business's posts when choosing an address", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));
    const formData = new FormData();
    formData.set("title", "Old title");

    await createBlogPostAction({ ok: true }, formData);

    const created = Array.from(store.blogPosts.values()).find(
      (doc) => doc.businessId === BUSINESS_B && doc.title === "Old title",
    );
    expect(created?.slug).toBe("old-title");
  });

  it("refuses an empty title without creating anything", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const formData = new FormData();
    formData.set("title", "   ");

    const result = await createBlogPostAction({ ok: true }, formData);

    expect(result).toEqual({ ok: false, message: "Give the post a title." });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateBlogPostAction", () => {
  it("updates title, excerpt and body on the caller's own post", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await updateBlogPostAction(POST_A_ID, fields({ excerpt: "New excerpt" }));

    expect(result).toEqual({ ok: true });
    const updated = store.blogPosts.get(POST_A_ID);
    expect(updated?.title).toBe("New title");
    expect(updated?.excerpt).toBe("New excerpt");
    expect(updated?.body).toEqual(JSON.parse(VALID_BODY_JSON));
  });

  it("refuses a save against another business's real post id, even naming that business's own post", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));

    const result = await updateBlogPostAction(POST_A_ID, fields({ title: "Hijacked", excerpt: "Hijacked" }));

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(store.blogPosts.get(POST_A_ID)?.title).toBe("Old title");
  });

  it("refuses an empty title without calling Payload's update", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await updateBlogPostAction(POST_A_ID, fields({ title: "   ", excerpt: "excerpt" }));

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses malformed body JSON without calling Payload's update", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await updateBlogPostAction(POST_A_ID, fields({ title: "Title", excerpt: "excerpt", bodyJson: "{not json" }));

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a post id that does not exist", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await updateBlogPostAction("does-not-exist", fields({ title: "Title", excerpt: "excerpt" }));

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("updateBlogPostAction: category, author and search settings", () => {
  it("saves the business's own category, author and search settings", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const result = await updateBlogPostAction(
      POST_A_ID,
      fields({
        categoryId: "cat-a",
        authorId: "author-a",
        metaTitle: "  Best recipes  ",
        metaDescription: "Try these",
        noIndex: true,
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({
      category: "cat-a",
      author: "author-a",
      metaTitle: "Best recipes",
      metaDescription: "Try these",
      noIndex: true,
    });
  });

  it("clears category and author when none is chosen, and stores blank search fields as null", async () => {
    store.blogPosts.set(POST_A_ID, { ...store.blogPosts.get(POST_A_ID)!, category: "cat-a", author: "author-a" });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields());
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({
      category: null,
      author: null,
      metaTitle: null,
      metaDescription: null,
      noIndex: false,
    });
  });

  it.each([
    ["another business's category", { categoryId: "cat-b" }],
    ["another business's author", { authorId: "author-b" }],
    ["a category that doesn't exist", { categoryId: "missing" }],
  ])("refuses %s and writes nothing", async (_label, overrides) => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const result = await updateBlogPostAction(POST_A_ID, fields(overrides));
    expect(result).toEqual({ ok: false, message: "That category or author no longer exists. Reload the page." });
    expect(store.blogPosts.get(POST_A_ID)!.title).toBe("Old title");
  });

  it("saves the address typed in one box: a prefix and an address, or an address at the root", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields({ address: " Health Tips/Desk Stretches " }));
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({ pathPrefix: "health-tips", slug: "desk-stretches" });
    await updateBlogPostAction(POST_A_ID, fields({ address: "desk-stretches" }));
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({ pathPrefix: "", slug: "desk-stretches" });
  });

  it("refuses an unusable address and writes nothing", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const result = await updateBlogPostAction(POST_A_ID, fields({ address: "api/x" }));
    expect(result).toEqual({ ok: false, message: '"api" is already used by your website. Choose another word.' });
    expect(store.blogPosts.get(POST_A_ID)!.title).toBe("Old title");
  });

  it("changes the article's address and remembers the old one, so it can redirect", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    expect(await updateBlogPostAction(POST_A_ID, fields({ address: "blog/ Desk Stretches " }))).toEqual({ ok: true });
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({ slug: "desk-stretches", previousSlugs: ["old-title"] });
  });

  it("makes the address from the title when it is left blank", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields({ title: "Monsoon Menu", address: "" }));
    expect(store.blogPosts.get(POST_A_ID)!.slug).toBe("monsoon-menu");
  });

  it("leaves the earlier addresses alone when the address doesn't change", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields());
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({ slug: "old-title", previousSlugs: [] });
  });

  it("refuses an address another of the business's posts uses, now or before", async () => {
    store.blogPosts.set("post-a2", {
      id: "post-a2",
      businessId: BUSINESS_A,
      title: "Another",
      slug: "monsoon-menu",
      previousSlugs: ["first-menu"],
      status: "draft",
    });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    for (const slug of ["monsoon-menu", "first-menu"]) {
      expect(await updateBlogPostAction(POST_A_ID, fields({ address: `tips/${slug}` }))).toEqual({
        ok: false,
        message: "Another of your posts already uses this address. Choose another.",
      });
    }
    expect(store.blogPosts.get(POST_A_ID)!.slug).toBe("old-title");
  });

  it("allows an address another business uses: addresses are per website", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    expect(await updateBlogPostAction(POST_A_ID, fields({ address: "business-bs-post" }))).toEqual({ ok: true });
  });

  it("caps the search description at what search engines show", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields({ metaDescription: "x".repeat(500) }));
    expect(store.blogPosts.get(POST_A_ID)!.metaDescription).toHaveLength(160);
  });
});

describe("updateBlogPostAction: publishing, scheduling and alt text", () => {
  const POST_A2_ID = "post-a2";

  beforeEach(() => {
    store.blogPosts.set(POST_A2_ID, {
      id: POST_A2_ID,
      businessId: BUSINESS_A,
      title: "Second",
      slug: "second",
      status: "published",
      publishedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("saves the cover image's alt text, trimmed, and blank as null", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    expect(await updateBlogPostAction(POST_A_ID, fields({ coverImageAlt: " A bowl of dal " }))).toEqual({ ok: true });
    expect(store.blogPosts.get(POST_A_ID)?.coverImageAlt).toBe("A bowl of dal");
    await updateBlogPostAction(POST_A_ID, fields({ coverImageAlt: "  " }));
    expect(store.blogPosts.get(POST_A_ID)?.coverImageAlt).toBeNull();
  });

  it("refuses a publish date that is not a date", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    expect((await updateBlogPostAction(POST_A_ID, fields({ publishedAt: "not a date" }))).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("publishes what is on screen in the same write, dated now when no date is set", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    const before = Date.now();
    expect(await updateBlogPostAction(POST_A_ID, fields({ title: "Fresh" }), "publish")).toEqual({ ok: true });
    const saved = store.blogPosts.get(POST_A_ID)!;
    expect(saved).toMatchObject({ title: "Fresh", status: "published" });
    expect(new Date(String(saved.publishedAt)).getTime()).toBeGreaterThanOrEqual(before);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("schedules a post published with a date ahead", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A_ID, fields({ publishedAt: "2027-01-05T04:30:00.000Z" }), "publish");
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({
      status: "published",
      publishedAt: "2027-01-05T04:30:00.000Z",
    });
  });

  it("keeps a published post published and its date when saved with the date cleared", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A2_ID, fields({ title: "Second", address: "blog/second" }));
    expect(store.blogPosts.get(POST_A2_ID)).toMatchObject({
      status: "published",
      publishedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("unpublishes in the same write as the save", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    await updateBlogPostAction(POST_A2_ID, fields({ title: "Back to draft", address: "blog/second" }), "unpublish");
    expect(store.blogPosts.get(POST_A2_ID)).toMatchObject({ title: "Back to draft", status: "draft" });
  });
});

describe("removeCoverImageAction", () => {
  it("takes the cover image and its alt text off the caller's own post", async () => {
    store.blogPosts.set(POST_A_ID, { ...store.blogPosts.get(POST_A_ID)!, coverImage: "media-a1", coverImageAlt: "Dal" });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    expect(await removeCoverImageAction(POST_A_ID)).toEqual({ ok: true });
    expect(store.blogPosts.get(POST_A_ID)).toMatchObject({ coverImage: null, coverImageAlt: null });
  });

  it("refuses another business's post", async () => {
    store.blogPosts.set(POST_A_ID, { ...store.blogPosts.get(POST_A_ID)!, coverImage: "media-a1" });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));
    expect((await removeCoverImageAction(POST_A_ID)).ok).toBe(false);
    expect(store.blogPosts.get(POST_A_ID)?.coverImage).toBe("media-a1");
  });
});

describe("duplicateBlogPostAction", () => {
  it("copies the caller's own post as a new draft with its own address, and opens it", async () => {
    store.blogPosts.set(POST_A_ID, {
      ...store.blogPosts.get(POST_A_ID)!,
      status: "published",
      publishedAt: "2026-09-01T10:00:00.000Z",
      previousSlugs: ["older"],
      category: "cat-a",
    });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    await duplicateBlogPostAction(POST_A_ID);

    const copy = Array.from(store.blogPosts.values()).find((doc) => doc.title === "Old title (copy)");
    expect(copy).toMatchObject({
      businessId: BUSINESS_A,
      slug: "old-title-copy",
      status: "draft",
      excerpt: "Old excerpt",
      category: "cat-a",
    });
    expect(copy?.publishedAt).toBeUndefined();
    expect(copy?.previousSlugs).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith(`/content/blog/${String(copy?.id)}`);
  });

  it("refuses another business's post, creating nothing", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));
    expect((await duplicateBlogPostAction(POST_A_ID)).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses once every allowed post is used", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));
    vi.mocked(getBlogUsage).mockResolvedValueOnce(USAGE_AT_LIMIT);
    expect((await duplicateBlogPostAction(POST_A_ID)).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("setCoverImageAction", () => {
  it("attaches the caller's own upload to the caller's own post", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await setCoverImageAction(POST_A_ID, "media-a1");

    expect(result).toEqual({ ok: true });
    expect(store.blogPosts.get(POST_A_ID)?.coverImage).toBe("media-a1");
  });

  it("refuses an upload that belongs to a different business", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    const result = await setCoverImageAction(POST_A_ID, "media-b1");

    expect(result.ok).toBe(false);
    expect(store.blogPosts.get(POST_A_ID)?.coverImage).toBeNull();
  });

  it("refuses to attach an image to another business's real post id", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));

    const result = await setCoverImageAction(POST_A_ID, "media-b1");

    expect(result.ok).toBe(false);
    expect(store.blogPosts.get(POST_A_ID)?.coverImage).toBeNull();
  });
});

describe("publishBlogPostAction / unpublishBlogPostAction", () => {
  it("publishes the caller's own post", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    await publishBlogPostAction(POST_A_ID);

    expect(store.blogPosts.get(POST_A_ID)?.status).toBe("published");
  });

  it("refuses to publish another business's real post id", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));

    await expect(publishBlogPostAction(POST_A_ID)).rejects.toThrow();

    expect(store.blogPosts.get(POST_A_ID)?.status).toBe("draft");
  });

  it("unpublishes the caller's own post", async () => {
    store.blogPosts.set(POST_A_ID, { ...store.blogPosts.get(POST_A_ID)!, status: "published" });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    await unpublishBlogPostAction(POST_A_ID);

    expect(store.blogPosts.get(POST_A_ID)?.status).toBe("draft");
  });

  it("refuses to unpublish another business's real post id", async () => {
    store.blogPosts.set(POST_A_ID, { ...store.blogPosts.get(POST_A_ID)!, status: "published" });
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));

    await expect(unpublishBlogPostAction(POST_A_ID)).rejects.toThrow();

    expect(store.blogPosts.get(POST_A_ID)?.status).toBe("published");
  });
});

describe("deleteBlogPostAction", () => {
  it("deletes the caller's own post", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_A));

    await deleteBlogPostAction(POST_A_ID);

    expect(store.blogPosts.has(POST_A_ID)).toBe(false);
  });

  it("refuses to delete another business's real post id, even given its real id", async () => {
    mockedRequireWebsiteAccess.mockResolvedValue(tenantFor(BUSINESS_B));

    await expect(deleteBlogPostAction(POST_A_ID)).rejects.toThrow();

    expect(store.blogPosts.has(POST_A_ID)).toBe(true);
  });
});

describe("every blog action, for a paid business without the Managed Website service", () => {
  beforeEach(() => {
    mockedRequireWebsiteAccess.mockRejectedValue(new WebsiteRequiredError(BUSINESS_A));
  });

  it("refuses to create, save or publish a post", async () => {
    const formData = new FormData();
    formData.set("title", "A new post");
    const refusal = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };

    await expect(createBlogPostAction({ ok: true }, formData)).resolves.toEqual(refusal);
    await expect(updateBlogPostAction(POST_A_ID, fields())).resolves.toEqual(refusal);
    await expect(publishBlogPostAction(POST_A_ID)).resolves.toEqual(refusal);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(store.blogPosts.get(POST_A_ID)?.title).toBe("Old title");
  });
});

describe("every blog action, for a business that has not paid", () => {
  beforeEach(() => {
    mockedRequireWebsiteAccess.mockRejectedValue(new BillingRequiredError(BUSINESS_A));
  });

  const refusal = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };

  it("refuses to create a post, with a message instead of a crash", async () => {
    const formData = new FormData();
    formData.set("title", "A new post");

    await expect(createBlogPostAction({ ok: true }, formData)).resolves.toEqual(refusal);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to save a post", async () => {
    await expect(updateBlogPostAction(POST_A_ID, fields())).resolves.toEqual(refusal);
    expect(store.blogPosts.get(POST_A_ID)?.title).toBe("Old title");
  });

  it("refuses to attach a cover image", async () => {
    await expect(setCoverImageAction(POST_A_ID, "media-a1")).resolves.toEqual(refusal);
    expect(store.blogPosts.get(POST_A_ID)?.coverImage).toBeNull();
  });

  it("refuses to publish or unpublish a post", async () => {
    await expect(publishBlogPostAction(POST_A_ID)).resolves.toEqual(refusal);
    await expect(unpublishBlogPostAction(POST_A_ID)).resolves.toEqual(refusal);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to duplicate a post or remove its cover", async () => {
    await expect(duplicateBlogPostAction(POST_A_ID)).resolves.toEqual(refusal);
    await expect(removeCoverImageAction(POST_A_ID)).resolves.toEqual(refusal);
    expect(store.blogPosts.has(POST_A_ID)).toBe(true);
  });

  it("refuses to delete a post", async () => {
    await expect(deleteBlogPostAction(POST_A_ID)).resolves.toEqual(refusal);
    expect(store.blogPosts.has(POST_A_ID)).toBe(true);
  });

  it("still lets any other failure through, so a real outage is not reported as unpaid", async () => {
    mockedRequireWebsiteAccess.mockRejectedValue(new Error("database is down"));

    await expect(publishBlogPostAction(POST_A_ID)).rejects.toThrow("database is down");
  });
});
