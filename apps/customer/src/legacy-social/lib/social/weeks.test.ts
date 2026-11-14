import { describe, expect, it, vi } from "vitest";
import { readBatches } from "./ai";

vi.mock("server-only", () => ({}));

const post = (id: string, over: Record<string, unknown> = {}) => ({ id, headline: `Headline ${id}`, caption: `Words ${id}`, state: "pending", ...over });
const batch = (over: Record<string, unknown> = {}) => ({ id: "week-01.json", createdAt: "2026-11-12T10:00:00Z", networks: ["instagram", "facebook"], posts: [post("p1", { date: "2026-11-16T10:00:00+05:30" }), post("p2", { date: "2026-11-23" })], ...over });

describe("readBatches: the weeks of a plan", () => {
  it("reads the weeks and the day of each post", () => {
    const [read] = readBatches({
      batches: [batch({ weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1"] }, { from: "2026-11-23", to: "2026-11-29", state: "drawn", postIds: ["p2"] }] })],
    });
    expect(read?.weeks).toEqual([
      { from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1"], notDrawn: [], missingDays: [], replacementsLeft: null, openPostIds: [] },
      { from: "2026-11-23", to: "2026-11-29", state: "drawn", postIds: ["p2"], notDrawn: [], missingDays: [], replacementsLeft: null, openPostIds: [] },
    ]);
    expect(read?.posts.map((one) => one.date)).toEqual(["2026-11-16", "2026-11-23"]);
  });

  it("reads a week drawn in rounds: which posts are still open, and which are drawn and final", () => {
    const [read] = readBatches({
      batches: [batch({ posts: [post("p1", { date: "2026-11-16", state: "kept", drawn: true, locked: true }), post("p2", { date: "2026-11-17", drawn: false, locked: false })], weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "partly_drawn", postIds: ["p1", "p2"], openPostIds: ["p2"] }] })],
    });
    expect(read?.weeks?.[0]).toMatchObject({ state: "partly_drawn", openPostIds: ["p2"] });
    expect(read?.posts.map((one) => [one.id, one.drawn, one.locked])).toEqual([
      ["p1", true, true],
      ["p2", false, false],
    ]);
    const [old] = readBatches({ batches: [batch()] });
    expect(old?.posts[0]?.locked).toBeUndefined();
  });

  it("reads which dropped post a new topic replaces, and how many new topics a week still allows", () => {
    const [read] = readBatches({
      batches: [batch({ posts: [post("p1", { date: "2026-11-16", state: "dropped", replacedBy: "p1-r1" }), post("p1-r1", { date: "2026-11-16", replaces: "p1" })], weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1", "p1-r1"], replacementsLeft: 2 }] })],
    });
    expect(read?.posts.map((one) => [one.id, one.replaces, one.replacedBy])).toEqual([
      ["p1", null, "p1-r1"],
      ["p1-r1", "p1", null],
    ]);
    expect(read?.weeks?.[0]?.replacementsLeft).toBe(2);
  });

  it("reads the topics that got no picture, per week and per post, with the service's sentence", () => {
    const reason = { code: "HEADLINE_TOO_WEAK", message: "This headline is too weak to draw. Change it or drop it." };
    const [read] = readBatches({
      batches: [batch({ posts: [post("p1", { date: "2026-11-16", notDrawn: reason }), post("p2", { date: "2026-11-16" })], weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "not_drawn", postIds: ["p1", "p2"], notDrawn: [{ postId: "p1", ...reason }] }] })],
    });
    expect(read?.weeks?.[0]?.state).toBe("not_drawn");
    expect(read?.weeks?.[0]?.notDrawn).toEqual([{ postId: "p1", ...reason }]);
    expect(read?.posts[0]?.notDrawn).toEqual(reason);
    expect(read?.posts[1]?.notDrawn).toBeNull();
  });

  it("reads an empty week and the days of a week that have no post", () => {
    const [read] = readBatches({
      batches: [batch({ weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1"], missingDays: ["2026-11-20"] }, { from: "2026-11-23", to: "2026-11-29", state: "empty", postIds: [] }] })],
    });
    expect(read?.weeks?.[0]?.missingDays).toEqual(["2026-11-20"]);
    expect(read?.weeks?.[1]).toMatchObject({ state: "empty", postIds: [], missingDays: [] });
  });

  it("has no weeks for a batch written before days were recorded, which is drawn in one piece as before", () => {
    const [read] = readBatches({ batches: [batch({ posts: [post("p1")] })] });
    expect(read?.weeks).toBeNull();
    expect(read?.posts[0]?.date).toBeNull();
  });

  it("shows the batch as one piece when any week cannot be read, so no post is hidden", () => {
    const [read] = readBatches({ batches: [batch({ weeks: [{ from: "2026-11-16", to: "2026-11-22", state: "waiting", postIds: ["p1"] }, { from: "soon", to: "later", state: "unknown", postIds: [] }] })] });
    expect(read?.weeks).toBeNull();
    expect(read?.posts).toHaveLength(2);
  });

  it("treats an empty list of weeks as none", () => {
    expect(readBatches({ batches: [batch({ weeks: [] })] })[0]?.weeks).toBeNull();
  });
});

describe("a failed job's words", () => {
  it("keeps the failure code and has plain words for a page that could not be read on its own", async () => {
    const { readJobs, knownWordsForCode } = await import("./ai");
    const [job] = readJobs({ jobs: [{ id: "j1", kind: "write", state: "failed", createdAt: "2026-11-12T10:00:00Z", failure: "PAGE_MODE_UNAVAILABLE" }] });
    expect(job?.failure).toBe("PAGE_MODE_UNAVAILABLE");
    expect(knownWordsForCode(job?.failure)).toBe("That page could not be read on its own. Use the whole website address instead.");
  });

  it("has no special words for a failure it does not know, so the general sentence is used", async () => {
    const { knownWordsForCode } = await import("./ai");
    expect(knownWordsForCode("SOMETHING_NEW")).toBeNull();
    expect(knownWordsForCode(undefined)).toBeNull();
  });
});

describe("the plan of a batches answer", () => {
  it("reads when the month ends and the Monday the next one would start", async () => {
    const { readBatchPlan } = await import("./ai");
    expect(readBatchPlan({ plan: { startsOn: "2026-11-16", endsOn: "2026-12-11T10:00:00+05:30", canStartNext: true, nextStartDate: "2026-12-14" } })).toEqual({ startsOn: "2026-11-16", endsOn: "2026-12-11", canStartNext: true, nextStartDate: "2026-12-14" });
  });

  it("is null for an older posting service that sends no plan, and for one it cannot read", async () => {
    const { readBatchPlan } = await import("./ai");
    expect(readBatchPlan({ batches: [] })).toBeNull();
    expect(readBatchPlan({ plan: { canStartNext: "yes" } })).toBeNull();
  });
});


describe("the topics answer", () => {
  it("reads where each channel's picture stands, and keeps working with an older posting service that sends no state", async () => {
    const { readTopics } = await import("./ai");
    const [topic] = readTopics({
      topics: [{ batchId: "week-01.json", postId: "p1", headline: "H", missing: [], networks: [{ network: "instagram", status: "written", pictureState: "waiting", drawsOn: "2026-11-19" }, { network: "facebook", status: "written" }] }],
    });
    expect(topic?.networks[0]).toMatchObject({ pictureState: "waiting", drawsOn: "2026-11-19" });
    expect(topic?.networks[1]?.pictureState).toBeUndefined();
  });
});

describe("the words for a draw the posting service refused for want of a connected list", () => {
  it("says in plain words that the connected accounts could not be checked, and to try again", async () => {
    const { wordsForCode } = await import("./ai");
    expect(wordsForCode("CONNECTED_UNKNOWN")).toBe("We could not check which of your accounts are connected just now. Try again in a minute.");
  });
});
