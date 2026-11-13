import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsite } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { createCategoryInlineAction, createPostAction, deletePostAction, duplicatePostAction, removeCoverImageAction, savePostAction, unlockPostsAction } from "./actions";
import { POST_GONE_MESSAGE, POST_SLUG_TAKEN_MESSAGE, RELATION_GONE_MESSAGE, SAVE_FAILED_MESSAGE, VIEWER_MESSAGE } from "./rules/messages";
import { EDITOR_BROKEN_MESSAGE, type BlogPostFields, type BlogUsage } from "./rules/posts";
import { getBlogUsage } from "./server/usage";

/*
 * The actions run for real against a stand-in for Payload's Local API, so these check what is written and, as important,
 * what is never written: another business's post, category or author, and anything from a viewer.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => {
  const control = (digest: string) => Object.assign(new Error(digest), { digest });
  return {
    redirect: vi.fn((to: string) => {
      throw control(`NEXT_REDIRECT;${to}`);
    }),
    notFound: vi.fn(() => {
      throw control("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
    unstable_rethrow: (error: unknown) => {
      if (typeof error === "object" && error !== null && "digest" in error) throw error;
    },
  };
});
vi.mock("@/lib/guards", () => ({ requireWebsite: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./server/payload", () => ({ getBlogPayload: async () => payload }));
vi.mock("./server/usage", () => ({ getBlogUsage: vi.fn() }));
vi.mock("./server/unlock", () => ({ openBlogUnlock: vi.fn(async () => ({ id: "charge-1" })) }));
vi.mock("@/features/checkout/server/charges", () => ({ startCustomerChargePayment: vi.fn(async () => ({ kind: "redirect", url: "https://pay.test/charge-1" })) }));

const MINE = "0192f3c4-1111-7000-8000-000000000001";
const THEIRS = "0192f3c4-2222-7000-8000-000000000002";

function customer(role: "owner" | "editor" | "viewer" = "owner", plan: unknown = { id: "plan" }) {
  return { role, tenant: { businessId: MINE }, businessId: MINE, billing: { plan, status: "paid", hasWebsite: true } } as never;
}

/** Documents by collection and id, as the stand-in Payload returns them. */
let docs: Record<string, Record<string, Record<string, unknown>>>;
let payload: {
  findByID: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function fakePayload() {
  return {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      const doc = docs[collection]?.[id];
      if (doc === undefined) throw Object.assign(new Error("Not Found"), { status: 404 });
      return doc;
    }),
    find: vi.fn(async ({ collection }: { collection: string }) => ({ docs: Object.values(docs[collection] ?? {}) })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 99, ...data })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };
}

const BODY = JSON.stringify({ root: { type: "root", children: [] } });

function fields(overrides: Partial<BlogPostFields> = {}): BlogPostFields {
  return { title: "Monsoon menu", excerpt: "", bodyJson: BODY, categoryId: "", authorId: "", metaTitle: "", metaDescription: "", noIndex: false, address: "", coverImageAlt: "", publishedAt: "", ...overrides };
}

const usage = (used: number): BlogUsage => ({ used, allowance: 100, nextBlock: { posts: 100, amountCents: 47_500, currency: "INR" } });

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = {
    blogPosts: {
      "7": { id: 7, businessId: MINE, title: "Monsoon menu", slug: "monsoon-menu", previousSlugs: [], status: "draft", publishedAt: null },
      "8": { id: 8, businessId: MINE, title: "Old", slug: "holiday-hours", previousSlugs: ["winter-hours"], status: "draft" },
      "9": { id: 9, businessId: THEIRS, title: "Theirs", slug: "theirs", status: "draft" },
    },
    blogCategories: { "3": { id: 3, businessId: MINE, name: "Menus", slug: "menus" }, "4": { id: 4, businessId: THEIRS, name: "Spa", slug: "spa" } },
    blogAuthors: { "5": { id: 5, businessId: THEIRS, name: "Someone" } },
  };
  payload = fakePayload();
  vi.mocked(requireWebsite).mockResolvedValue(customer());
  vi.mocked(getBlogUsage).mockResolvedValue(usage(10));
});

describe("every blog write", () => {
  it("asks the guard for a running paid period with the website", async () => {
    await savePostAction("7", fields(), "save");
    expect(requireWebsite).toHaveBeenCalledWith({ write: true });
  });

  it("refuses a viewer before anything is read or written", async () => {
    vi.mocked(requireWebsite).mockResolvedValue(customer("viewer"));
    for (const result of [await savePostAction("7", fields(), "publish"), await deletePostAction("7"), await createPostAction(null, form({ title: "Hi" })), await createCategoryInlineAction("News")]) {
      expect(result).toEqual({ ok: false, message: VIEWER_MESSAGE });
    }
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("answers an unexpected failure in words, reports it, and writes nothing more", async () => {
    payload.update.mockRejectedValueOnce(new Error("database gone"));
    expect(await savePostAction("7", fields(), "save")).toEqual({ ok: false, message: SAVE_FAILED_MESSAGE });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "blog.post.save" });
  });
});

describe("savePostAction", () => {
  it("refuses input that is not what the editor sends", async () => {
    expect(await savePostAction("abc", fields(), "save")).toEqual({ ok: false, message: EDITOR_BROKEN_MESSAGE });
    expect(await savePostAction("7", fields(), "delete" as never)).toEqual({ ok: false, message: EDITOR_BROKEN_MESSAGE });
    expect(await savePostAction("7", fields({ categoryId: "../3" }), "save")).toEqual({ ok: false, message: EDITOR_BROKEN_MESSAGE });
  });

  it("names the field that is wrong", async () => {
    expect(await savePostAction("7", fields({ title: " " }), "save")).toEqual({ ok: false, message: "Give the post a title.", fieldErrors: { title: "Give the post a title." } });
    expect(await savePostAction("7", fields({ publishedAt: "soon" }), "save")).toMatchObject({ ok: false, fieldErrors: { publishedAt: expect.any(String) } });
  });

  it("treats another business's post as gone and writes nothing", async () => {
    expect(await savePostAction("9", fields(), "publish")).toEqual({ ok: false, message: POST_GONE_MESSAGE });
    expect(await savePostAction("404", fields(), "publish")).toEqual({ ok: false, message: POST_GONE_MESSAGE });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("refuses an address another post answers at, now or through an earlier address", async () => {
    expect(await savePostAction("7", fields({ address: "blog/winter-hours" }), "save")).toEqual({ ok: false, message: POST_SLUG_TAKEN_MESSAGE, fieldErrors: { address: POST_SLUG_TAKEN_MESSAGE } });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("refuses a category or author of another business", async () => {
    expect(await savePostAction("7", fields({ categoryId: "4" }), "save")).toEqual({ ok: false, message: RELATION_GONE_MESSAGE });
    expect(await savePostAction("7", fields({ authorId: "5" }), "save")).toEqual({ ok: false, message: RELATION_GONE_MESSAGE });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("publishes in the same write as the save, keeping the old address for redirects", async () => {
    expect(await savePostAction("7", fields({ address: "tips/monsoon", categoryId: "3", metaTitle: " " }), "publish")).toEqual({ ok: true });
    const write = payload.update.mock.calls[0]?.[0] as { id: string; data: Record<string, unknown> };
    expect(write.id).toBe("7");
    expect(write.data).toMatchObject({ status: "published", pathPrefix: "tips", slug: "monsoon", previousSlugs: ["monsoon-menu"], category: 3, author: null, metaTitle: null });
    expect(typeof write.data.publishedAt).toBe("string");
  });
});

describe("createPostAction", () => {
  it("refuses at the limit, whatever the page showed", async () => {
    vi.mocked(getBlogUsage).mockResolvedValue(usage(100));
    expect(await createPostAction(null, form({ title: "Hi" }))).toEqual({ ok: false, message: "You've used all 100 of your blog posts. Unlock 100 more from your blog page." });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("applies no limit when there is no plan", async () => {
    vi.mocked(getBlogUsage).mockResolvedValue(null);
    await expect(createPostAction(null, form({ title: "Hi" }))).rejects.toThrow("NEXT_REDIRECT;/website/blog/99");
  });

  it("refuses a title with nothing to make an address from", async () => {
    expect(await createPostAction(null, form({ title: "  " }))).toMatchObject({ ok: false, fieldErrors: { title: "Give the post a title." } });
    expect(await createPostAction(null, form({ title: "!!!" }))).toMatchObject({ ok: false, fieldErrors: { title: expect.stringContaining("usable web address") } });
  });

  it("creates a draft for the session's business with a free address, then opens it", async () => {
    await expect(createPostAction(null, form({ title: "Monsoon menu", businessId: THEIRS }))).rejects.toThrow("NEXT_REDIRECT;/website/blog/99");
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({ collection: "blogPosts", data: { businessId: MINE, title: "Monsoon menu", slug: "monsoon-menu-2", status: "draft" } });
  });
});

describe("the other post actions", () => {
  it("duplicate a draft copy without the search title, and count it against the allowance", async () => {
    docs.blogPosts!["7"] = { ...docs.blogPosts!["7"], metaTitle: "Typed", metaDescription: "Kept", status: "published", publishedAt: "2026-10-01T00:00:00.000Z" };
    await expect(duplicatePostAction("7")).rejects.toThrow("NEXT_REDIRECT;/website/blog/99");
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({ data: { businessId: MINE, title: "Monsoon menu (copy)", metaTitle: null, metaDescription: "Kept", status: "draft" } });
    expect(payload.create.mock.calls[0]?.[0].data).not.toHaveProperty("publishedAt");

    vi.mocked(getBlogUsage).mockResolvedValue(usage(100));
    expect(await duplicatePostAction("7")).toMatchObject({ ok: false });
  });

  it("do not delete or change another business's post", async () => {
    expect(await deletePostAction("9")).toEqual({ ok: false, message: POST_GONE_MESSAGE });
    expect(await removeCoverImageAction("9")).toEqual({ ok: false, message: POST_GONE_MESSAGE });
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("clear the cover's description with the cover", async () => {
    expect(await removeCoverImageAction("7")).toEqual({ ok: true });
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ id: "7", data: { coverImage: null, coverImageAlt: null } }));
  });

  it("unlock more posts only at the limit, then go to the payment", async () => {
    await expect(unlockPostsAction()).rejects.toThrow("NEXT_REDIRECT;/website/blog");
    vi.mocked(getBlogUsage).mockResolvedValue(usage(100));
    await expect(unlockPostsAction()).rejects.toThrow("NEXT_REDIRECT;https://pay.test/charge-1");
  });
});

describe("createCategoryInlineAction", () => {
  it("returns the existing category of the same name, whatever its case", async () => {
    expect(await createCategoryInlineAction(" menus ")).toEqual({ ok: true, data: { id: "3", name: "Menus" } });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("creates a new one with a free address", async () => {
    expect(await createCategoryInlineAction("Spa")).toEqual({ ok: true, data: { id: "99", name: "Spa" } });
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({ data: { businessId: MINE, name: "Spa", slug: "spa" } });
  });
});
