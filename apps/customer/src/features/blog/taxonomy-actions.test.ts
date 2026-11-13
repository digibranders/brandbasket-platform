import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsite } from "@/lib/guards";
import { AUTHOR_GONE_MESSAGE, CATEGORY_GONE_MESSAGE, CATEGORY_SLUG_TAKEN_MESSAGE, VIEWER_MESSAGE } from "./rules/messages";
import type { BlogCategoryFields } from "./rules/taxonomy";
import { createCategoryAction, deleteAuthorAction, deleteCategoryAction, removeAuthorPhotoAction, saveAuthorAction, saveCategoryAction } from "./taxonomy-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT;${to}`), { digest: `NEXT_REDIRECT;${to}` });
  }),
  unstable_rethrow: (error: unknown) => {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
  },
}));
vi.mock("@/lib/guards", () => ({ requireWebsite: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./server/payload", () => ({ getBlogPayload: async () => payload }));

const MINE = "0192f3c4-1111-7000-8000-000000000001";
const THEIRS = "0192f3c4-2222-7000-8000-000000000002";
const NO_LINKS = { website: "", instagram: "", facebook: "", linkedin: "", x: "" };

let docs: Record<string, Record<string, Record<string, unknown>>>;
let payload: { findByID: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

function category(overrides: Partial<BlogCategoryFields> = {}): BlogCategoryFields {
  return { name: "Back care", description: "", slugAuto: true, slug: "", metaTitle: "", metaDescription: "", ...overrides };
}

function form(name: string): FormData {
  const data = new FormData();
  data.set("name", name);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = {
    blogCategories: {
      "3": { id: 3, businessId: MINE, name: "Menus", slug: "menus" },
      "4": { id: 4, businessId: MINE, name: "Spa", slug: "back-care" },
      "6": { id: 6, businessId: THEIRS, name: "Theirs", slug: "theirs" },
    },
    blogAuthors: { "1": { id: 1, businessId: MINE, name: "Asha" }, "2": { id: 2, businessId: THEIRS, name: "Ravi" } },
  };
  payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      const doc = docs[collection]?.[id];
      if (doc === undefined) throw Object.assign(new Error("Not Found"), { status: 404 });
      return doc;
    }),
    // Payload filters by business; the stand-in returns only the business's own, as the real query does.
    find: vi.fn(async ({ collection }: { collection: string }) => ({ docs: Object.values(docs[collection] ?? {}).filter((doc) => doc.businessId === MINE) })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 99, ...data })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };
  vi.mocked(requireWebsite).mockResolvedValue({ role: "editor", tenant: { businessId: MINE }, businessId: MINE } as never);
});

describe("author actions", () => {
  it("refuse a viewer", async () => {
    vi.mocked(requireWebsite).mockResolvedValue({ role: "viewer", tenant: { businessId: MINE } } as never);
    expect(await saveAuthorAction("1", { name: "Asha", role: "", bio: "", links: NO_LINKS })).toEqual({ ok: false, message: VIEWER_MESSAGE });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("treat another business's author as gone", async () => {
    expect(await saveAuthorAction("2", { name: "Ravi", role: "", bio: "", links: NO_LINKS })).toEqual({ ok: false, message: AUTHOR_GONE_MESSAGE });
    expect(await removeAuthorPhotoAction("2")).toEqual({ ok: false, message: AUTHOR_GONE_MESSAGE });
    expect(await deleteAuthorAction("2")).toEqual({ ok: false, message: AUTHOR_GONE_MESSAGE });
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("name the link that is not a web address", async () => {
    expect(await saveAuthorAction("1", { name: "Asha", role: "", bio: "", links: { ...NO_LINKS, x: "javascript:alert(1)" } })).toMatchObject({ ok: false, fieldErrors: { x: expect.any(String) } });
  });

  it("save cleaned fields with links as web addresses", async () => {
    expect(await saveAuthorAction("1", { name: " Asha  Rao ", role: "Head physio", bio: "", links: { ...NO_LINKS, instagram: "instagram.com/asha" } })).toEqual({ ok: true });
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: "blogAuthors", id: "1", data: expect.objectContaining({ name: "Asha Rao", role: "Head physio", bio: null, instagram: "https://instagram.com/asha", website: null }) }));
  });

  it("refuse an id that is not one Payload makes", async () => {
    expect(await saveAuthorAction("1 OR 1=1", { name: "Asha", role: "", bio: "", links: NO_LINKS })).toMatchObject({ ok: false });
    expect(payload.findByID).not.toHaveBeenCalled();
  });
});

describe("category actions", () => {
  it("refuse a name another category has, whatever its case", async () => {
    expect(await createCategoryAction(null, form("MENUS"))).toMatchObject({ ok: false, fieldErrors: { name: "You already have a category called Menus." } });
    expect(await saveCategoryAction("4", category({ name: "menus" }))).toMatchObject({ ok: false, message: "You already have a category called Menus." });
  });

  it("refuse a typed address another category uses, but number an automatic one", async () => {
    expect(await saveCategoryAction("3", category({ name: "Menus", slugAuto: false, slug: "Back Care" }))).toEqual({ ok: false, message: CATEGORY_SLUG_TAKEN_MESSAGE, fieldErrors: { slug: CATEGORY_SLUG_TAKEN_MESSAGE } });
    expect(await saveCategoryAction("3", category({ name: "Back care" }))).toEqual({ ok: true });
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ id: "3", data: expect.objectContaining({ name: "Back care", slug: "back-care-2" }) }));
  });

  it("treat another business's category as gone", async () => {
    expect(await saveCategoryAction("6", category())).toEqual({ ok: false, message: CATEGORY_GONE_MESSAGE });
    expect(await deleteCategoryAction("6")).toEqual({ ok: false, message: CATEGORY_GONE_MESSAGE });
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("create for the session's business and open the new category", async () => {
    await expect(createCategoryAction(null, form("Back care"))).rejects.toThrow("NEXT_REDIRECT;/website/blog/categories/99");
    expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: { businessId: MINE, name: "Back care", slug: "back-care-2" } }));
  });
});
