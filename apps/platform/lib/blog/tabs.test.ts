import { describe, expect, it } from "vitest";
import { BLOG_TABS, currentBlogTab } from "./tabs";

describe("BLOG_TABS", () => {
  it("is Posts, Authors and Categories, in that order, on their own paths", () => {
    expect(BLOG_TABS.map((tab) => [tab.label, tab.href])).toEqual([
      ["Posts", "/content/blog"],
      ["Authors", "/content/authors"],
      ["Categories", "/content/categories"],
    ]);
  });
});

describe("currentBlogTab", () => {
  it("marks Posts on the list, the editor and the blog's settings page", () => {
    for (const path of ["/content/blog", "/content/blog/new", "/content/blog/0192f3c4", "/content/blog/settings"]) expect(currentBlogTab(path)?.label, path).toBe("Posts");
  });

  it("marks Authors and Categories on their pages and the pages under them", () => {
    for (const path of ["/content/authors", "/content/authors/new", "/content/authors/abc"]) expect(currentBlogTab(path)?.label, path).toBe("Authors");
    for (const path of ["/content/categories", "/content/categories/new", "/content/categories/abc"]) expect(currentBlogTab(path)?.label, path).toBe("Categories");
  });

  it("marks nothing on a page that is not the blog's", () => {
    for (const path of ["/website", "/content/blogger", "/content"]) expect(currentBlogTab(path), path).toBeNull();
  });
});
