import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { BillingRequiredError, requireBillingAccess } from "@/lib/server/billing";
import { BLOG_PAYMENT_REQUIRED_MESSAGE } from "@/lib/server/blog";
import {
  createAuthorAction,
  deleteAuthorAction,
  removeAuthorPhotoAction,
  saveAuthorAction,
  setAuthorPhotoAction,
} from "./actions";

/*
 * The taxonomy tests' "mocked Payload client, real logic" pattern: the ownership check runs for real, because it is
 * the whole defense against a client-supplied author or media id naming another business's.
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
const GONE = { ok: false, message: "This author no longer exists. Reload the page." };
const NO_LINKS = { website: "", instagram: "", facebook: "", linkedin: "", x: "" };

function tenantFor(businessId: string) {
  return { user: { id: "user-1" }, tenant: { userId: "user-1", businessId }, billing: { hasAccess: true } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mockedRequireBillingAccess.mockResolvedValue(tenantFor(BUSINESS_A));
  store.blogAuthors!.set("author-a", { id: "author-a", businessId: BUSINESS_A, name: "Asha", bio: "Chef" });
  store.blogAuthors!.set("author-b", { id: "author-b", businessId: BUSINESS_B, name: "Ben", bio: null });
  store.blogPosts!.set("post-a", { id: "post-a", businessId: BUSINESS_A, author: "author-a" });
  store.media!.set("media-a", { id: "media-a", businessId: BUSINESS_A });
  store.media!.set("media-b", { id: "media-b", businessId: BUSINESS_B });
});

describe("createAuthorAction", () => {
  it("creates an author for the caller's business and opens it", async () => {
    const formData = new FormData();
    formData.set("name", "  Meera  K ");
    await createAuthorAction({ ok: true }, formData);
    const created = [...store.blogAuthors!.values()].find((doc) => doc.name === "Meera K");
    expect(created).toMatchObject({ businessId: BUSINESS_A });
    expect(redirect).toHaveBeenCalledWith(`/content/authors/${String(created?.id)}`);
  });

  it("refuses an author with no name", async () => {
    const formData = new FormData();
    formData.set("name", " ");
    expect(await createAuthorAction({ ok: true }, formData)).toEqual({ ok: false, message: "Give the author a name." });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("saveAuthorAction", () => {
  it("saves name, role, bio and links, with blanks as null", async () => {
    const result = await saveAuthorAction("author-a", {
      name: "Asha Rao",
      role: "Head chef",
      bio: "",
      links: { ...NO_LINKS, instagram: "instagram.com/asha" },
    });
    expect(result).toEqual({ ok: true });
    expect(store.blogAuthors!.get("author-a")).toMatchObject({
      name: "Asha Rao",
      role: "Head chef",
      bio: null,
      instagram: "https://instagram.com/asha",
      website: null,
    });
  });

  it("refuses another business's author and writes nothing", async () => {
    expect(await saveAuthorAction("author-b", { name: "Hijacked", role: "", bio: "", links: NO_LINKS })).toEqual(GONE);
    expect(store.blogAuthors!.get("author-b")?.name).toBe("Ben");
  });

  it("refuses a link that is not a web address", async () => {
    const result = await saveAuthorAction("author-a", {
      name: "Asha",
      role: "",
      bio: "",
      links: { ...NO_LINKS, website: "javascript:alert(1)" },
    });
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("author photo", () => {
  it("attaches the caller's own upload, and removes it", async () => {
    expect(await setAuthorPhotoAction("author-a", "media-a")).toEqual({ ok: true });
    expect(store.blogAuthors!.get("author-a")?.photo).toBe("media-a");
    expect(await removeAuthorPhotoAction("author-a")).toEqual({ ok: true });
    expect(store.blogAuthors!.get("author-a")?.photo).toBeNull();
  });

  it("refuses another business's upload or author", async () => {
    expect((await setAuthorPhotoAction("author-a", "media-b")).ok).toBe(false);
    expect(await setAuthorPhotoAction("author-b", "media-a")).toEqual(GONE);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("deleteAuthorAction", () => {
  it("deletes the author, leaves their posts without one, and returns to the list", async () => {
    await deleteAuthorAction("author-a");
    expect(store.blogAuthors!.has("author-a")).toBe(false);
    expect(store.blogPosts!.get("post-a")?.author).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/content/authors");
  });

  it("refuses another business's author", async () => {
    expect(await deleteAuthorAction("author-b")).toEqual(GONE);
    expect(store.blogAuthors!.has("author-b")).toBe(true);
  });
});

describe("for a business that has not paid", () => {
  it("refuses every author action with a message", async () => {
    mockedRequireBillingAccess.mockRejectedValue(new BillingRequiredError(BUSINESS_A));
    const refusal = { ok: false, message: BLOG_PAYMENT_REQUIRED_MESSAGE };
    expect(await saveAuthorAction("author-a", { name: "X", role: "", bio: "", links: NO_LINKS })).toEqual(refusal);
    expect(await setAuthorPhotoAction("author-a", "media-a")).toEqual(refusal);
    expect(await deleteAuthorAction("author-a")).toEqual(refusal);
    expect(store.blogAuthors!.get("author-a")?.name).toBe("Asha");
  });
});
