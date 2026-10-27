import { describe, expect, it } from "vitest";
import { searchSummary } from "@/lib/search/summary";
import type { SnapshotView } from "@/lib/overview";

const blank: SnapshotView = {
  adSpendCents: null,
  adBudgetCents: null,
  adEnquiries: null,
  postsPublished: null,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
};

type Item = Parameters<typeof searchSummary>[0]["items"][number];
const item = (id: string, overrides: Partial<Item> = {}): Item => ({ id, kind: "page", title: `Item ${id}`, status: "published", dueOn: "2026-11-10", linkUrl: null, ...overrides });
const MONTH = "2026-11-01";

describe("searchSummary page one", () => {
  const summary = (snapshot: SnapshotView | null) => searchSummary({ snapshot, items: [], month: MONTH }).pageOne;

  it("says up, down and same as resultLines does", () => {
    expect(summary({ ...blank, keywordsPageOne: 9, keywordsPageOnePrev: 6 })).toEqual({ figure: "9", detail: "Up from 6" });
    expect(summary({ ...blank, keywordsPageOne: 4, keywordsPageOnePrev: 12 })).toEqual({ figure: "4", detail: "Down from 12" });
    expect(summary({ ...blank, keywordsPageOne: 6, keywordsPageOnePrev: 6 })).toEqual({ figure: "6", detail: "Same as last month" });
  });

  it("has no detail when last month is unknown", () => {
    expect(summary({ ...blank, keywordsPageOne: 6 })).toEqual({ figure: "6", detail: null });
  });

  it("is null without a snapshot or without a measured figure", () => {
    expect(summary(null)).toBeNull();
    expect(summary(blank)).toBeNull();
  });
});

describe("searchSummary items", () => {
  it("lists published pages and listings done in the month, newest first", () => {
    const result = searchSummary({
      snapshot: null,
      month: MONTH,
      items: [
        item("p1", { dueOn: "2026-11-03", linkUrl: "https://example.com/a" }),
        item("p2", { dueOn: "2026-11-20" }),
        item("l1", { kind: "listing", dueOn: "2026-11-05" }),
        item("l2", { kind: "listing", dueOn: "2026-11-12" }),
      ],
    });
    expect(result.pages).toEqual([
      { id: "p2", title: "Item p2", dueOn: "2026-11-20", linkUrl: null },
      { id: "p1", title: "Item p1", dueOn: "2026-11-03", linkUrl: "https://example.com/a" },
    ]);
    expect(result.listings).toEqual([
      { id: "l2", title: "Item l2" },
      { id: "l1", title: "Item l1" },
    ]);
  });

  it("leaves out a planned page, a page done last month and one with no date", () => {
    const result = searchSummary({
      snapshot: null,
      month: MONTH,
      items: [item("planned", { status: "planned" }), item("old", { dueOn: "2026-10-30" }), item("next", { dueOn: "2026-12-01" }), item("undated", { dueOn: null })],
    });
    expect(result.pages).toEqual([]);
    expect(result.listings).toEqual([]);
  });
});
