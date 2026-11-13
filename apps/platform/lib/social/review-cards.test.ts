import { describe, expect, it } from "vitest";
import type { Poster, WrittenBatch } from "./ai";
import { groupReview } from "./review-cards";

const post = (id: string, state: "pending" | "kept" | "dropped" = "kept") => ({ id, headline: `Headline ${id}`, caption: "C", captions: {}, state, edited: false, advice: null, date: null, notDrawn: null });
const batch = (id: string, ids: string[]): WrittenBatch => ({ id, createdAt: "x", networks: ["instagram", "linkedin"], rules: {}, posts: ids.map((one) => post(one)), weeks: null });
const poster = (over: Partial<Poster>): Poster => ({ id: "v1", batchId: "week-01.json", postId: "p1", network: "instagram", shape: "square", width: 1, height: 1, headline: "Drawn headline", caption: "C", versionNumber: 1, status: "pending", canRedraw: false, redrawsLeft: 0, createdAt: "2026-11-11T10:00:00Z", ...over });

describe("groupReview", () => {
  it("puts a written post and its pictures on one card, networks in the page's order", () => {
    const [group] = groupReview([batch("week-01.json", ["p1", "p2"])], [poster({ id: "b", network: "linkedin" }), poster({ id: "a", network: "instagram" })]);
    expect(group?.cards.map((card) => card.postId)).toEqual(["p1", "p2"]);
    expect(group?.cards[0]?.written?.id).toBe("p1");
    expect(group?.cards[0]?.pictures.map((one) => one.id)).toEqual(["a", "b"]);
    expect(group?.cards[1]?.pictures).toEqual([]);
  });

  it("keeps the pictures of a batch that is no longer listed, under the headline they carry, after the listed batches", () => {
    const groups = groupReview([batch("week-02.json", ["q1"])], [poster({ id: "d", batchId: "week-01.json", postId: "p9", headline: "Fresh laddoos" })]);
    expect(groups.map((group) => group.batchId)).toEqual(["week-02.json", "week-01.json"]);
    expect(groups[1]?.batch).toBeNull();
    expect(groups[1]?.cards[0]).toMatchObject({ headline: "Fresh laddoos", written: null });
  });

  it("adds a picture whose post is not in its listed batch to that batch, and gives an empty list for nothing", () => {
    const [group] = groupReview([batch("week-01.json", ["p1"])], [poster({ postId: "p7", headline: "Seven" })]);
    expect(group?.cards.map((card) => card.postId)).toEqual(["p1", "p7"]);
    expect(groupReview([], [])).toEqual([]);
  });

  it("keeps two versions of one network apart by when they were made", () => {
    const [group] = groupReview([], [poster({ id: "new", createdAt: "2026-11-12T10:00:00Z" }), poster({ id: "old", status: "rejected" })]);
    expect(group?.cards[0]?.pictures.map((one) => one.id)).toEqual(["old", "new"]);
  });
});
