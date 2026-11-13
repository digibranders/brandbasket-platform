import { describe, expect, it } from "vitest";
import {
  blogLimitMessage,
  blogPublishState,
  cleanPostFields,
  copyTitle,
  EDITOR_BROKEN_MESSAGE,
  fieldsFromPost,
  fromLocalInputValue,
  isAtBlogLimit,
  publishOutcome,
  sameFields,
  toBlogPostFields,
  toLocalInputValue,
  type BlogPost,
  type BlogPostFields,
  type BlogUsage,
} from "./posts";

const NOW = Date.UTC(2026, 8, 30, 12);

describe("blogPublishState", () => {
  it("is a draft whatever its date", () => {
    expect(blogPublishState("draft", null, NOW)).toBe("draft");
    expect(blogPublishState("draft", NOW + 60_000, NOW)).toBe("draft");
  });

  it("is scheduled while a published post's date is ahead", () => {
    expect(blogPublishState("published", NOW + 60_000, NOW)).toBe("scheduled");
  });

  it("is published once its date has come, or when it has none", () => {
    expect(blogPublishState("published", NOW, NOW)).toBe("published");
    expect(blogPublishState("published", NOW - 60_000, NOW)).toBe("published");
    expect(blogPublishState("published", null, NOW)).toBe("published");
  });
});

const POST: BlogPost = {
  id: "7",
  title: "Monsoon menu",
  status: "draft",
  updatedAt: 0,
  publishedAt: null,
  categoryName: null,
  authorName: null,
  publishState: "draft",
  slug: "monsoon-menu",
  excerpt: null,
  body: null,
  coverImage: null,
  coverImageAlt: "",
  categoryId: "3",
  authorId: null,
  metaTitle: null,
  metaDescription: "Hot soups all season",
  noIndex: true,
  pathPrefix: "blog",
};

describe("fieldsFromPost and toBlogPostFields", () => {
  it("round-trip a post, with a blank search title on Auto", () => {
    const fields = fieldsFromPost(POST);
    expect(fields).toMatchObject({ metaTitleAuto: true, metaDescriptionAuto: false, noIndex: true, address: "blog/monsoon-menu", categoryId: "3", authorId: "", publishedAtLocal: "" });
    expect(toBlogPostFields(fields, "{}")).toMatchObject({ metaTitle: "", metaDescription: "Hot soups all season", noIndex: true, publishedAt: "", bodyJson: "{}" });
  });

  it("send a typed search field as blank while Auto is on", () => {
    expect(toBlogPostFields({ ...fieldsFromPost(POST), metaDescriptionAuto: true }, "{}").metaDescription).toBe("");
  });
});

describe("local date inputs", () => {
  it("round-trip an instant through the browser's own time zone, to the minute", () => {
    const time = new Date(2026, 8, 30, 14, 5).getTime();
    expect(toLocalInputValue(time)).toBe("2026-09-30T14:05");
    expect(fromLocalInputValue("2026-09-30T14:05")).toBe(new Date(time).toISOString());
  });

  it("keep blank as blank and pass an unreadable value through for the server to refuse", () => {
    expect(toLocalInputValue(null)).toBe("");
    expect(fromLocalInputValue(" ")).toBe("");
    expect(fromLocalInputValue("soon")).toBe("soon");
  });
});

describe("sameFields", () => {
  it("compares every field", () => {
    const fields = fieldsFromPost(POST);
    expect(sameFields(fields, { ...fields })).toBe(true);
    expect(sameFields(fields, { ...fields, noIndex: false })).toBe(false);
  });
});

const BODY = JSON.stringify({ root: { type: "root", children: [] } });

function fields(overrides: Partial<BlogPostFields> = {}): BlogPostFields {
  return {
    title: "Monsoon menu",
    excerpt: "",
    bodyJson: BODY,
    categoryId: "",
    authorId: "",
    metaTitle: "",
    metaDescription: "",
    noIndex: false,
    address: "",
    coverImageAlt: "",
    publishedAt: "",
    ...overrides,
  };
}

describe("cleanPostFields", () => {
  it("cleans, caps and stores blank search fields as null", () => {
    const result = cleanPostFields(fields({ excerpt: "e".repeat(500), metaDescription: "d".repeat(200), coverImageAlt: "  ", address: "" }));
    expect(result).toMatchObject({ ok: true, value: { title: "Monsoon menu", metaTitle: null, coverImageAlt: null, pathPrefix: "blog", slug: "monsoon-menu", publishedAt: null } });
    expect(result.ok && [result.value.excerpt?.length, result.value.metaDescription?.length]).toEqual([400, 160]);
  });

  it("refuses a missing title, a bad address and an unreal date, naming the field", () => {
    expect(cleanPostFields(fields({ title: "  " }))).toMatchObject({ ok: false, field: "title", message: "Give the post a title." });
    expect(cleanPostFields(fields({ address: "a/b/c" }))).toMatchObject({ ok: false, field: "address" });
    expect(cleanPostFields(fields({ publishedAt: "soon" }))).toEqual({ ok: false, field: "publishedAt", message: "That publish date isn't a real date. Pick it again." });
  });

  it("keeps a typed date as an ISO instant", () => {
    expect(cleanPostFields(fields({ publishedAt: "2026-10-01T05:30:00.000Z" }))).toMatchObject({ ok: true, value: { publishedAt: "2026-10-01T05:30:00.000Z" } });
  });

  it("refuses a body that is too long, not JSON, or not a Lexical document", () => {
    expect(cleanPostFields(fields({ bodyJson: `"${"x".repeat(200_001)}"` }))).toMatchObject({ ok: false, field: "body", message: "That post is too long. Trim it and try again." });
    expect(cleanPostFields(fields({ bodyJson: "{" }))).toMatchObject({ ok: false, message: EDITOR_BROKEN_MESSAGE });
    expect(cleanPostFields(fields({ bodyJson: "[]" }))).toMatchObject({ ok: false, message: EDITOR_BROKEN_MESSAGE });
    expect(cleanPostFields(fields({ bodyJson: "null" }))).toMatchObject({ ok: false, message: EDITOR_BROKEN_MESSAGE });
  });
});

describe("publishOutcome", () => {
  const now = new Date("2026-10-01T10:00:00.000Z");
  const draft = { status: "draft" as const, publishedAt: null };
  const live = { status: "published" as const, publishedAt: "2026-09-01T10:00:00.000Z" };

  it("publishes with the typed date, else the post's own, else now", () => {
    expect(publishOutcome("publish", draft, "2026-12-01T00:00:00.000Z", now)).toEqual({ status: "published", publishedAt: "2026-12-01T00:00:00.000Z" });
    expect(publishOutcome("publish", { ...draft, publishedAt: "2026-09-15T00:00:00.000Z" }, null, now).publishedAt).toBe("2026-09-15T00:00:00.000Z");
    expect(publishOutcome("publish", draft, null, now).publishedAt).toBe(now.toISOString());
  });

  it("keeps a published post's date when the box is cleared", () => {
    expect(publishOutcome("save", live, null, now)).toEqual(live);
  });

  it("lets a draft keep whatever is typed, or none", () => {
    expect(publishOutcome("save", draft, null, now)).toEqual(draft);
    expect(publishOutcome("save", draft, "2026-12-01T00:00:00.000Z", now)).toEqual({ status: "draft", publishedAt: "2026-12-01T00:00:00.000Z" });
  });

  it("unpublishes to a draft", () => {
    expect(publishOutcome("unpublish", live, null, now).status).toBe("draft");
  });
});

describe("copyTitle", () => {
  it("adds (copy) within the title limit", () => {
    expect(copyTitle("Monsoon menu")).toBe("Monsoon menu (copy)");
    expect(copyTitle("t".repeat(200)).length).toBe(200);
    expect(copyTitle(undefined)).toBe("Untitled (copy)");
  });
});

describe("the post allowance", () => {
  const usage = (used: number): BlogUsage => ({ used, allowance: 100, nextBlock: { posts: 100, amountCents: 47_500, currency: "INR" } });

  it("is reached when every post is used, drafts included", () => {
    expect(isAtBlogLimit(usage(99))).toBe(false);
    expect(isAtBlogLimit(usage(100))).toBe(true);
    expect(isAtBlogLimit(usage(101))).toBe(true);
  });

  it("applies no limit when there is no plan to count against", () => {
    expect(isAtBlogLimit(null)).toBe(false);
  });

  it("says how many are used and how many more can be unlocked", () => {
    expect(blogLimitMessage(usage(100))).toBe("You've used all 100 of your blog posts. Unlock 100 more from your blog page.");
  });
});
