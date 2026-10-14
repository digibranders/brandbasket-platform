import { describe, expect, it } from "vitest";
import type { BlogPost } from "@/lib/server/blog";
import {
  fieldsFromPost,
  fromLocalInputValue,
  sameFields,
  toBlogPostFields,
  toLocalInputValue,
} from "./blog-editor-fields";

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

describe("fieldsFromPost / toBlogPostFields", () => {
  it("round-trips a post, with a blank search title on Auto", () => {
    const fields = fieldsFromPost(POST);
    expect(fields).toMatchObject({
      metaTitleAuto: true,
      metaDescriptionAuto: false,
      noIndex: true,
      address: "blog/monsoon-menu",
      categoryId: "3",
      authorId: "",
      publishedAtLocal: "",
    });
    expect(toBlogPostFields(fields, "{}")).toMatchObject({
      metaTitle: "",
      metaDescription: "Hot soups all season",
      noIndex: true,
      publishedAt: "",
      bodyJson: "{}",
    });
  });

  it("sends a typed search field as blank while Auto is on", () => {
    const fields = { ...fieldsFromPost(POST), metaDescriptionAuto: true };
    expect(toBlogPostFields(fields, "{}").metaDescription).toBe("");
  });
});

describe("local date inputs", () => {
  it("round-trips an instant through the browser's own time zone, to the minute", () => {
    const time = new Date(2026, 8, 30, 14, 5).getTime();
    expect(toLocalInputValue(time)).toBe("2026-09-30T14:05");
    expect(fromLocalInputValue("2026-09-30T14:05")).toBe(new Date(time).toISOString());
  });

  it("keeps blank as blank and passes an unreadable value through for the server to refuse", () => {
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
