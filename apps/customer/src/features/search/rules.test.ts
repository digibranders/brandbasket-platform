import { describe, expect, it } from "vitest";
import { doneThisMonth, httpsUrl, pageOne, type SearchItemRow } from "./rules";

const AT = new Date("2026-11-23T05:00:00.000Z");
const row = (over: Partial<SearchItemRow>): SearchItemRow => ({ id: "a", kind: "page", title: "Tests page", status: "published", dueOn: "2026-11-10", linkUrl: null, ...over });

describe("pageOne", () => {
  it("is null, never 0, when the count was not measured", () => {
    expect(pageOne(null)).toBeNull();
    expect(pageOne({ keywordsPageOne: null, keywordsPageOnePrev: 4, updatedAt: AT })).toBeNull();
  });

  it("carries the count, the change in the old words and the date it was checked", () => {
    expect(pageOne({ keywordsPageOne: 9, keywordsPageOnePrev: 6, updatedAt: AT })).toEqual({ count: 9, change: "Up from 6", diff: 3, checkedAt: AT });
    expect(pageOne({ keywordsPageOne: 4, keywordsPageOnePrev: 6, updatedAt: AT })).toMatchObject({ change: "Down from 6", diff: -2 });
    expect(pageOne({ keywordsPageOne: 6, keywordsPageOnePrev: 6, updatedAt: AT })).toMatchObject({ change: "Same as last month", diff: 0 });
    expect(pageOne({ keywordsPageOne: 6, keywordsPageOnePrev: null, updatedAt: AT })).toMatchObject({ change: null, diff: null });
  });
});

describe("doneThisMonth", () => {
  it("keeps published pages and listings dated inside the month, newest first", () => {
    const rows = [
      row({ id: "old", dueOn: "2026-11-02" }),
      row({ id: "new", dueOn: "2026-11-20" }),
      row({ id: "listing", kind: "listing", dueOn: "2026-11-20" }),
      row({ id: "planned", status: "planned" }),
      row({ id: "october", dueOn: "2026-10-30" }),
      row({ id: "december", dueOn: "2026-12-01" }),
      row({ id: "undated", dueOn: null }),
      row({ id: "post", kind: "post" }),
    ];
    expect(doneThisMonth(rows, "2026-11-01").map((item) => item.id)).toEqual(["new", "listing", "old"]);
  });

  it("links a page only when its address is https", () => {
    expect(doneThisMonth([row({ linkUrl: "https://apex.in/tests" })], "2026-11-01")[0]?.href).toBe("https://apex.in/tests");
    expect(doneThisMonth([row({ linkUrl: "http://apex.in/tests" })], "2026-11-01")[0]?.href).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });
});
