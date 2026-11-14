import { describe, expect, it } from "vitest";
import type { Poster, WrittenBatch, WrittenPost } from "./ai";
import type { ReviewGroup } from "./review-cards";
import { cardsOfWeek, channelTodo, channelTodoCounts, firstOpenWeek, flowWeeks, groupIsFor, picturesOn, replaceStates, sortChannels, weekAsked } from "./review-flow";

const post = (id: string, state: WrittenPost["state"], date: string | null = "2026-11-16"): WrittenPost => ({ id, headline: `Headline ${id}`, caption: "Words", captions: {}, state, edited: false, advice: null, date, notDrawn: null });
const poster = (id: string, postId: string, status: Poster["status"], network: Poster["network"] = "instagram"): Poster => ({ id, batchId: "b1", postId, network, shape: "square", width: 1080, height: 1080, headline: `Headline ${postId}`, caption: "Words", versionNumber: 1, status, canRedraw: true, redrawsLeft: 2, createdAt: "2026-11-13T10:00:00Z" });
const batch = (posts: WrittenPost[], weeks: WrittenBatch["weeks"]): WrittenBatch => ({ id: "b1", createdAt: "2026-11-13T10:00:00Z", networks: ["instagram"], posts, rules: {}, weeks });
const group = (b: WrittenBatch, pictures: Poster[] = []): ReviewGroup => ({
  batchId: b.id,
  batch: b,
  cards: b.posts.map((one) => ({ key: `${b.id}/${one.id}`, batchId: b.id, postId: one.id, headline: one.headline, written: one, pictures: pictures.filter((pic) => pic.postId === one.id), states: [] })),
});
const week = (from: string, state: "waiting" | "drawn" | "drawing", postIds: string[]) => ({ from, to: from.replace(/\d\d$/, "22"), state, postIds, notDrawn: [], missingDays: [] });

describe("flowWeeks", () => {
  it("lists each week of a batch, oldest first", () => {
    const b = batch([post("p1", "pending"), post("p2", "pending", "2026-11-23")], [week("2026-11-23", "waiting", ["p2"]), week("2026-11-16", "waiting", ["p1"])]);
    const weeks = flowWeeks([group(b)], []);
    expect(weeks.map((w) => w.from)).toEqual(["2026-11-16", "2026-11-23"]);
    expect(weeks[0]?.whole).toBe(false);
  });

  it("gives one whole week for a batch without weeks, drawing when its pictures were asked for", () => {
    const b = batch([post("p1", "kept", "2026-11-18"), post("p2", "pending", "2026-11-16")], null);
    const [only] = flowWeeks([group(b)], ["b1"]);
    expect(only).toMatchObject({ whole: true, from: "2026-11-16", to: "2026-11-18", state: "drawing", postIds: ["p1", "p2"] });
    expect(flowWeeks([group(b)], [])[0]?.state).toBe("waiting");
  });

  it("gives a drawn week for a batch that is no longer listed", () => {
    const g: ReviewGroup = { batchId: "b9", batch: null, cards: [{ key: "b9/p1", batchId: "b9", postId: "p1", headline: "H", written: null, pictures: [poster("x", "p1", "pending")], states: [] }] };
    expect(flowWeeks([g], [])[0]).toMatchObject({ state: "drawn", whole: true, postIds: ["p1"] });
  });
});

describe("the week to open and what is left in it", () => {
  const b = batch([post("p1", "kept"), post("p2", "pending", "2026-11-23")], [week("2026-11-16", "drawn", ["p1"]), week("2026-11-23", "waiting", ["p2"])]);
  const g = group(b, [poster("x1", "p1", "approved")]);
  const weeks = flowWeeks([g], []);

  it("opens the first week with something to decide or approve", () => {
    expect(firstOpenWeek([g], weeks)).toBe("b1:2026-11-23");
    expect(firstOpenWeek([], [])).toBeNull();
  });

  it("knows when a week is asked for", () => {
    expect(weekAsked(weeks[0]!)).toBe(true);
    expect(weekAsked(weeks[1]!)).toBe(false);
  });

  it("counts topics to decide while a week is open, and pictures to approve once it is drawn", () => {
    expect(channelTodo(cardsOfWeek([g], weeks[1]!), weeks[1], "instagram")).toEqual({ count: 1, words: "1 to decide" });
    expect(channelTodo(cardsOfWeek([g], weeks[0]!), weeks[0], "instagram")).toEqual({ count: 0, words: "All approved" });
    expect(channelTodo(cardsOfWeek([g], weeks[0]!), weeks[0], "linkedin")).toEqual({ count: 0, words: "No pictures" });
    expect(channelTodo([], undefined, "instagram").words).toBe("Nothing yet");
  });

  it("picks the pictures of one channel", () => {
    const cards = cardsOfWeek([g], weeks[0]!);
    expect(picturesOn(cards, "instagram").map((p) => p.id)).toEqual(["x1"]);
    expect(picturesOn(cards, "facebook")).toEqual([]);
  });
});

describe("new topics for dropped posts", () => {
  it("says which dropped posts have a new topic being written or a failed try, by the newest job of each", () => {
    expect(
      replaceStates([
        { kind: "replace", state: "running", postId: "p1" },
        { kind: "replace", state: "failed", postId: "p1" },
        { kind: "replace", state: "failed", postId: "p2" },
        { kind: "replace", state: "done", postId: "p3" },
        { kind: "draw", state: "running", postId: "p4" },
        { kind: "replace", state: "queued" },
      ]),
    ).toEqual({ p1: "writing", p2: "failed" });
  });

  it("carries how many new topics a week still allows", () => {
    const b = batch([post("p1", "dropped")], [{ ...week("2026-11-16", "waiting", ["p1"]), replacementsLeft: 2 }]);
    expect(flowWeeks([group(b)], [])[0]?.replacementsLeft).toBe(2);
    expect(flowWeeks([group(batch([post("p1", "dropped")], null))], [])[0]?.replacementsLeft).toBeNull();
  });
});

describe("channelTodoCounts", () => {
  it("counts the topics waiting for the customer in the batch each channel is written for, and nothing for a channel with no batch", () => {
    const b = batch([post("p1", "pending"), post("p2", "pending"), post("p3", "kept")], [week("2026-11-16", "waiting", ["p1", "p2", "p3"])]);
    expect(channelTodoCounts([group(b)], ["instagram", "facebook"])).toEqual({ instagram: 2, facebook: 0 });
  });

  it("is the number the Posts page shows for the first week with something to do", () => {
    const b = batch([post("p1", "kept"), post("p2", "pending", "2026-11-23")], [week("2026-11-16", "waiting", ["p1"]), week("2026-11-23", "waiting", ["p2"])]);
    expect(channelTodoCounts([group(b)], ["instagram"])).toEqual({ instagram: 1 });
  });
});

describe("groupIsFor", () => {
  it("is for the networks of the batch, or of the pictures once its posts are gone", () => {
    const b = batch([post("p1", "pending")], null);
    expect(groupIsFor(group(b), "instagram")).toBe(true);
    expect(groupIsFor(group(b), "facebook")).toBe(false);
    const gone: ReviewGroup = { batchId: "b2", batch: null, cards: [{ key: "b2/p1", batchId: "b2", postId: "p1", headline: "H", written: null, pictures: [poster("x", "p1", "approved", "linkedin")], states: [] }] };
    expect(groupIsFor(gone, "linkedin")).toBe(true);
    expect(groupIsFor(gone, "instagram")).toBe(false);
  });
});

describe("sortChannels", () => {
  it("puts the channels in one fixed order whatever order they came in", () => {
    const rows = [{ platform: "facebook" as const }, { platform: "google" as const }, { platform: "instagram" as const }, { platform: "linkedin" as const }];
    expect(sortChannels(rows).map((row) => row.platform)).toEqual(["instagram", "facebook", "linkedin", "google"]);
  });
});
