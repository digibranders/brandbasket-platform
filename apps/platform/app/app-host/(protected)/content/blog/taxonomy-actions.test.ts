import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingRequiredError, requireBillingAccess } from "@/lib/server/billing";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import { createBlogAuthorByNameAction, createBlogCategoryAction } from "./taxonomy-actions";

/*
 * Same "mocked Payload client, real logic" pattern as actions.test.ts: the ownership checks in
 * lib/server/blog-taxonomy.ts run for real, because they are the whole defense against a client-supplied id naming
 * another business's category or author. Only Payload itself is a hand-built double.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/server/billing", () => ({
  requireBillingAccess: vi.fn(),
  BillingRequiredError: class BillingRequiredError extends Error {
    readonly businessId: string;
    constructor(businessId: string) {
      super(`Business ${businessId} has no paid subscription, so this action is not available.`);
      this.name = "BillingRequiredError";
      this.businessId = businessId;
    }
  },
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));

const { FakeNotFound, store, resetStore, findByID, find, create, update, deleteDoc } = vi.hoisted(() => {
  class FakeNotFound extends Error {
    constructor() {
      super("Not Found.");
      this.name = "NotFound";
    }
  }

  type Doc = Record<string, unknown> & { readonly id: string };
  const store: Record<string, Map<string, Doc>> = {
    blogCategories: new Map(),
    blogAuthors: new Map(),
    blogPosts: new Map(),
  };

  function resetStore(): void {
    for (const key of Object.keys(store)) store[key] = new Map();
  }

  const findByID = vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
    const doc = store[collection]?.get(String(id));
    if (doc === undefined) throw new FakeNotFound();
    return doc;
  });

  // Ignores `where` on purpose: the code under test must filter by business itself.
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: Array.from(store[collection]?.values() ?? []),
  }));

  let nextId = 100;
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

  /** Mirrors the real foreign keys: posts pointing at a deleted category or author keep existing, set to null. */
  const RELATION_FIELD: Record<string, string> = { blogCategories: "category", blogAuthors: "author" };
  const deleteDoc = vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
    if (!store[collection]?.delete(String(id))) throw new FakeNotFound();
    const field = RELATION_FIELD[collection];
    if (field !== undefined) {
      for (const [postId, post] of store.blogPosts!) {
        if (post[field] === String(id)) store.blogPosts!.set(postId, { ...post, [field]: null });
      }
    }
    return { id };
  });

  return { FakeNotFound, store, resetStore, findByID, find, create, update, deleteDoc };
});

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({ findByID, find, create, update, delete: deleteDoc })),
  NotFound: FakeNotFound,
}));

const mockedRequireBillingAccess = vi.mocked(requireBillingAccess);

const BUSINESS_A = "0192f3c4-aaaa-7000-8000-00000000000a";
const BUSINESS_B = "0192f3c4-bbbb-7000-8000-00000000000b";

function tenantFor(businessId: string) {
  return { user: { id: "user-1" }, tenant: { userId: "user-1", businessId }, billing: { hasAccess: true } } as never;
}

function categoriesOf(businessId: string) {
  return [...store.blogCategories!.values()].filter((doc) => doc.businessId === businessId);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mockedRequireBillingAccess.mockResolvedValue(tenantFor(BUSINESS_A));
  store.blogCategories!.set("cat-a", { id: "cat-a", businessId: BUSINESS_A, name: "Recipes", slug: "recipes" });
  store.blogCategories!.set("cat-b", { id: "cat-b", businessId: BUSINESS_B, name: "News", slug: "news" });
  store.blogAuthors!.set("author-a", { id: "author-a", businessId: BUSINESS_A, name: "Asha", bio: "Chef" });
  store.blogAuthors!.set("author-b", { id: "author-b", businessId: BUSINESS_B, name: "Ben", bio: null });
  store.blogPosts!.set("post-a", { id: "post-a", businessId: BUSINESS_A, category: "cat-a", author: "author-a" });
});

describe("createBlogCategoryAction", () => {
  it("creates a category for the caller's business with an address made from its name", async () => {
    const result = await createBlogCategoryAction("  Special   Offers ");
    expect(result).toMatchObject({ ok: true, value: { name: "Special Offers" } });
    expect(categoriesOf(BUSINESS_A).find((c) => c.name === "Special Offers")).toMatchObject({
      businessId: BUSINESS_A,
      slug: "special-offers",
    });
  });

  it("returns the existing category for the same name in any case, creating nothing", async () => {
    expect(await createBlogCategoryAction(" recipes ")).toEqual({ ok: true, value: { id: "cat-a", name: "Recipes" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("numbers the address when another of this business's categories already has it", async () => {
    await createBlogCategoryAction("Recipes!");
    expect(categoriesOf(BUSINESS_A).find((c) => c.name === "Recipes!")?.slug).toBe("recipes-2");
  });

  it("ignores other businesses' names and addresses", async () => {
    const result = await createBlogCategoryAction("News");
    expect(result.ok).toBe(true);
    expect(categoriesOf(BUSINESS_A).find((c) => c.name === "News")?.slug).toBe("news");
  });

  it("refuses a blank name or one with no letters or digits", async () => {
    expect(await createBlogCategoryAction("   ")).toEqual({ ok: false, message: "Give the category a name." });
    expect(await createBlogCategoryAction("!!!")).toEqual({
      ok: false,
      message: "Use some letters or numbers in the name.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers with the payment message for an unpaid business", async () => {
    mockedRequireBillingAccess.mockRejectedValue(new BillingRequiredError(BUSINESS_A));
    expect(await createBlogCategoryAction("Offers")).toEqual({ ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("the post editor's inline New author", () => {
  it("creates an author by name for the caller's business", async () => {
    expect(await createBlogAuthorByNameAction("  Meera ")).toMatchObject({ ok: true, value: { name: "Meera" } });
    const created = [...store.blogAuthors!.values()].find((a) => a.name === "Meera");
    expect(created).toMatchObject({ businessId: BUSINESS_A, bio: null });
  });

  it("refuses an author with no name", async () => {
    expect(await createBlogAuthorByNameAction("  ")).toEqual({ ok: false, message: "Give the author a name." });
  });
});
