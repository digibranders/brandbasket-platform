import { describe, expect, it } from "vitest";
import { pagePosts, POSTS_PAGE_SIZE } from "./posts-page";
import type { PostRow } from "./view";

const row = (n: number, platform: PostRow["platform"] = "instagram", title = `Post number ${n}`): PostRow => ({ key: `k${n}`, title, platform, day: "2026-11-27", link: null, totals: { reach: n } });
const twelve = Array.from({ length: 12 }, (_, i) => row(i + 1, i % 3 === 0 ? "facebook" : "instagram"));

describe("pagePosts", () => {
  it("shows five posts a page and numbers them straight on from the page before", () => {
    expect(POSTS_PAGE_SIZE).toBe(5);
    const first = pagePosts(twelve, { platform: "all", query: "", page: 1 });
    expect([first.rows.length, first.firstNumber, first.total, first.page, first.pageCount]).toEqual([5, 1, 12, 1, 3]);
    const third = pagePosts(twelve, { platform: "all", query: "", page: 3 });
    expect([third.rows.length, third.firstNumber]).toEqual([2, 11]);
  });

  it("brings a page that does not exist back to the nearest one", () => {
    expect(pagePosts(twelve, { platform: "all", query: "", page: 9 }).page).toBe(3);
    expect(pagePosts(twelve, { platform: "all", query: "", page: 0 }).page).toBe(1);
    expect(pagePosts(twelve, { platform: "all", query: "", page: Number.NaN }).page).toBe(1);
  });

  it("filters by network and by words in the post, and counts only what matches", () => {
    const facebook = pagePosts(twelve, { platform: "facebook", query: "", page: 1 });
    expect(facebook.total).toBe(4);
    expect(facebook.rows.every((one) => one.platform === "facebook")).toBe(true);
    const found = pagePosts(twelve, { platform: "all", query: "  NUMBER 7 ", page: 1 });
    expect(found.rows.map((one) => one.key)).toEqual(["k7"]);
    expect(pagePosts(twelve, { platform: "facebook", query: "number 2", page: 1 }).total).toBe(0);
  });

  it("is one empty page when nothing matches", () => {
    const none = pagePosts([], { platform: "all", query: "", page: 4 });
    expect([none.rows.length, none.total, none.page, none.pageCount]).toEqual([0, 0, 1, 1]);
  });
});
