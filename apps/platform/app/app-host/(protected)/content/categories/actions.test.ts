import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { BillingRequiredError, requireBillingAccess } from "@/lib/server/billing";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import { createCategoryAction, deleteCategoryAction, saveCategoryAction } from "./actions";
import type { BlogCategoryFields } from "@/lib/blog-category-fields";

/*
 * The taxonomy tests' "mocked Payload client, real logic" pattern: the ownership check runs for real, because it is
 * the whole defense against a client-supplied category id naming another business's.
 */
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
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
    media: new Map(),
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
const GONE = { ok: false, message: "This category no longer exists. Reload the page." };

function tenantFor(businessId: string) {
  return { user: { id: "user-1" }, tenant: { userId: "user-1", businessId }, billing: { hasAccess: true } } as never;
}

function fields(overrides: Partial<BlogCategoryFields> = {}): BlogCategoryFields {
  return { name: "Recipes", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mockedRequireBillingAccess.mockResolvedValue(tenantFor(BUSINESS_A));
  store.blogCategories!.set("cat-a", { id: "cat-a", businessId: BUSINESS_A, name: "Recipes", slug: "recipes" });
  store.blogCategories!.set("cat-a2", { id: "cat-a2", businessId: BUSINESS_A, name: "News", slug: "news" });
  store.blogCategories!.set("cat-b", { id: "cat-b", businessId: BUSINESS_B, name: "Offers", slug: "offers" });
  store.blogPosts!.set("post-a", { id: "post-a", businessId: BUSINESS_A, category: "cat-a" });
});

describe("createCategoryAction", () => {
  it("creates a category for the caller's business and opens it", async () => {
    const formData = new FormData();
    formData.set("name", " Special  Offers ");
    await createCategoryAction({ ok: true }, formData);
    const created = [...store.blogCategories!.values()].find((doc) => doc.name === "Special Offers");
    expect(created).toMatchObject({ businessId: BUSINESS_A, slug: "special-offers" });
    expect(redirect).toHaveBeenCalledWith(`/content/categories/${String(created?.id)}`);
  });

  it("refuses a name the business already uses, in any case, but not one another business uses", async () => {
    const formData = new FormData();
    formData.set("name", "recipes");
    expect(await createCategoryAction({ ok: true }, formData)).toEqual({
      ok: false,
      message: "You already have a category called Recipes.",
    });
    formData.set("name", "Offers");
    await createCategoryAction({ ok: true }, formData);
    expect([...store.blogCategories!.values()].some((doc) => doc.businessId === BUSINESS_A && doc.name === "Offers")).toBe(true);
  });
});

describe("saveCategoryAction", () => {
  it("saves description and search fields, and moves the address with the name while Auto is on", async () => {
    const result = await saveCategoryAction(
      "cat-a",
      fields({ name: "Home Recipes", description: "Cooking at home.", metaTitle: "Recipes | Aster" }),
    );
    expect(result).toEqual({ ok: true });
    expect(store.blogCategories!.get("cat-a")).toMatchObject({
      name: "Home Recipes",
      slug: "home-recipes",
      description: "Cooking at home.",
      metaTitle: "Recipes | Aster",
      metaDescription: null,
    });
  });

  it("numbers an Auto address another category has, but refuses a typed one", async () => {
    store.blogCategories!.set("cat-a3", { id: "cat-a3", businessId: BUSINESS_A, name: "Other", slug: "tips" });
    await saveCategoryAction("cat-a", fields({ name: "Tips" }));
    expect(store.blogCategories!.get("cat-a")?.slug).toBe("tips-2");
    expect(await saveCategoryAction("cat-a", fields({ name: "Tips", slugAuto: false, slug: "news" }))).toEqual({
      ok: false,
      message: "Another of your categories already uses this address. Choose another.",
    });
  });

  it("keeps a typed address", async () => {
    await saveCategoryAction("cat-a", fields({ slugAuto: false, slug: "Kitchen" }));
    expect(store.blogCategories!.get("cat-a")?.slug).toBe("kitchen");
  });

  it("refuses a name another of the business's categories has", async () => {
    expect((await saveCategoryAction("cat-a", fields({ name: "NEWS" }))).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses another business's category and writes nothing", async () => {
    expect(await saveCategoryAction("cat-b", fields({ name: "Hijacked" }))).toEqual(GONE);
    expect(store.blogCategories!.get("cat-b")?.name).toBe("Offers");
  });
});

describe("deleteCategoryAction", () => {
  it("deletes the category, leaves its posts without one, and returns to the list", async () => {
    await deleteCategoryAction("cat-a");
    expect(store.blogCategories!.has("cat-a")).toBe(false);
    expect(store.blogPosts!.get("post-a")?.category).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/content/categories");
  });

  it("refuses another business's category", async () => {
    expect(await deleteCategoryAction("cat-b")).toEqual(GONE);
    expect(store.blogCategories!.has("cat-b")).toBe(true);
  });
});

describe("for a business that has not paid", () => {
  it("refuses every category action with a message", async () => {
    mockedRequireBillingAccess.mockRejectedValue(new BillingRequiredError(BUSINESS_A));
    const refusal = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };
    expect(await saveCategoryAction("cat-a", fields({ name: "X" }))).toEqual(refusal);
    expect(await deleteCategoryAction("cat-a")).toEqual(refusal);
    expect(store.blogCategories!.get("cat-a")?.name).toBe("Recipes");
  });
});
