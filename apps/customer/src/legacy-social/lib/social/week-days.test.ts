import { describe, expect, it } from "vitest";
import type { BatchWeek, WrittenBatch, WrittenPost } from "./ai";
import { addDays, daysWords, everyWeekSummary, planEveryWeek } from "./week-days";

const post = (id: string, date: string | null, state: WrittenPost["state"] = "pending", extra: Partial<WrittenPost> = {}): WrittenPost => ({ id, headline: `Headline ${id}`, caption: "Words", captions: {}, state, edited: false, advice: null, date, notDrawn: null, ...extra });
const week = (from: string, postIds: string[], state: BatchWeek["state"] = "waiting", openPostIds?: string[]): BatchWeek => ({ from, to: addDays(from, 6), state, postIds, ...(openPostIds === undefined ? {} : { openPostIds }), notDrawn: [], missingDays: [] });

/** Four weeks of Monday, Tuesday and Thursday, from Monday 16 November. */
const plan = (overrides: { readonly weeks?: Partial<Record<number, BatchWeek["state"]>>; readonly edit?: (posts: WrittenPost[]) => WrittenPost[] } = {}): WrittenBatch => {
  const mondays = ["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"];
  let posts = mondays.flatMap((monday, w) => [post(`w${String(w)}a`, monday), post(`w${String(w)}b`, addDays(monday, 1)), post(`w${String(w)}c`, addDays(monday, 3))]);
  if (overrides.edit !== undefined) posts = overrides.edit(posts);
  const weeks = mondays.map((monday, w) => week(monday, [`w${String(w)}a`, `w${String(w)}b`, `w${String(w)}c`], overrides.weeks?.[w] ?? "waiting"));
  return { id: "b1", createdAt: "2026-11-13T10:00:00Z", networks: ["instagram"], posts, rules: {}, weeks };
};

/** Week 0 after she moved Monday's topic to Wednesday: Tuesday, Wednesday and Thursday. */
const movedFirstWeek = (posts: WrittenPost[]): WrittenPost[] => posts.map((one) => (one.id === "w0a" ? { ...one, date: "2026-11-18" } : one));

const base = { batchId: "b1", weekFrom: "2026-11-16", today: "2026-11-14", renewsOn: null };
const datesOf = (moves: readonly { readonly postId: string; readonly day: string }[]): string[] => moves.map((move) => `${move.postId}:${move.day}`);

describe("planEveryWeek", () => {
  it("makes the days she arranged the days of every other week that can still change", () => {
    const result = planEveryWeek({ ...base, batches: [plan({ edit: movedFirstWeek })] });
    expect(result?.days).toEqual(["tue", "wed", "thu"]);
    // The first topic of a week goes to Tuesday, the second to Wednesday, the third stays on Thursday.
    expect(datesOf(result?.moves ?? [])).toEqual(["w1a:2026-11-24", "w1b:2026-11-25", "w2a:2026-12-01", "w2b:2026-12-02", "w3a:2026-12-08", "w3b:2026-12-09"]);
    expect(result?.weeksChanged).toEqual(["2026-11-23", "2026-11-30", "2026-12-07"]);
    expect(result?.skipped).toEqual([]);
  });

  it("leaves a week that is already drawn as it is and says so, scenario of week 1 drawn then week 3 changed", () => {
    // Week 3 (30 Nov) was arranged as Tuesday, Wednesday, Friday; week 1 is drawn.
    const batch = plan({
      weeks: { 0: "drawn" },
      edit: (posts) => posts.map((one) => (one.id === "w2a" ? { ...one, date: "2026-12-01" } : one.id === "w2b" ? { ...one, date: "2026-12-02" } : one.id === "w2c" ? { ...one, date: "2026-12-04" } : one)),
    });
    const result = planEveryWeek({ ...base, weekFrom: "2026-11-30", batches: [batch] });
    expect(result?.days).toEqual(["tue", "wed", "fri"]);
    expect(result?.weeksChanged).toEqual(["2026-11-23", "2026-12-07"]);
    expect(result?.skipped).toEqual([{ weekFrom: "2026-11-16", reason: "drawn", count: 3 }]);
    // If week 1 was not drawn, it follows too.
    const undrawn = plan({
      edit: (posts) => posts.map((one) => (one.id === "w2a" ? { ...one, date: "2026-12-01" } : one.id === "w2b" ? { ...one, date: "2026-12-02" } : one.id === "w2c" ? { ...one, date: "2026-12-04" } : one)),
    });
    const again = planEveryWeek({ ...base, weekFrom: "2026-11-30", today: "2026-11-10", batches: [undrawn] });
    expect(again?.weeksChanged).toEqual(["2026-11-16", "2026-11-23", "2026-12-07"]);
  });

  it("moves only the topics that are still open in a week with some topics drawn", () => {
    const batch = plan({ edit: movedFirstWeek });
    const partly = { ...batch, weeks: (batch.weeks ?? []).map((one) => (one.from === "2026-11-23" ? { ...one, state: "partly_drawn" as const, openPostIds: ["w1b", "w1c"] } : one)) };
    const result = planEveryWeek({ ...base, batches: [partly] });
    // The topic on Monday is drawn and stays. The two open ones take the first days in order: Tuesday (already there) and Wednesday.
    expect(datesOf(result?.moves ?? []).filter((move) => move.startsWith("w1"))).toEqual(["w1c:2026-11-25"]);
  });

  it("does not move a topic to today or a day that has passed, and says how many stayed", () => {
    const result = planEveryWeek({ ...base, today: "2026-11-23", batches: [plan({ edit: movedFirstWeek })] });
    // Week 2 (23 Nov): Tuesday is tomorrow and allowed, but Monday's topic would go to Tuesday and the topic on Tuesday to Wednesday.
    expect(datesOf(result?.moves ?? []).filter((move) => move.startsWith("w1"))).toEqual(["w1a:2026-11-24", "w1b:2026-11-25"]);
    const late = planEveryWeek({ ...base, today: "2026-11-24", batches: [plan({ edit: movedFirstWeek })] });
    expect(late?.skipped).toContainEqual({ weekFrom: "2026-11-23", reason: "passed", count: 1 });
  });

  it("keeps a topic inside the paid month", () => {
    const result = planEveryWeek({ ...base, renewsOn: "2026-12-08", batches: [plan({ edit: movedFirstWeek })] });
    // Monday 7 Dec would go to the renewal day itself, which is not in the month; the topic already on the renewal day may still move.
    expect(datesOf(result?.moves ?? [])).not.toContain("w3a:2026-12-08");
    expect(datesOf(result?.moves ?? [])).toContain("w3b:2026-12-09");
    expect(result?.skipped).toContainEqual({ weekFrom: "2026-12-07", reason: "month", count: 1 });
  });

  it("uses the first days in a week with fewer topics, and keeps the extra topics of a longer week where they are", () => {
    const fewer = plan({ edit: (posts) => movedFirstWeek(posts).filter((one) => one.id !== "w1c") });
    const batchFewer = { ...fewer, weeks: (fewer.weeks ?? []).map((one) => (one.from === "2026-11-23" ? { ...one, postIds: ["w1a", "w1b"] } : one)) };
    expect(datesOf(planEveryWeek({ ...base, batches: [batchFewer] })?.moves ?? []).filter((move) => move.startsWith("w1"))).toEqual(["w1a:2026-11-24", "w1b:2026-11-25"]);
    const longer = plan({ edit: (posts) => [...movedFirstWeek(posts), post("w1d", "2026-11-27")] });
    const batchLonger = { ...longer, weeks: (longer.weeks ?? []).map((one) => (one.from === "2026-11-23" ? { ...one, postIds: ["w1a", "w1b", "w1c", "w1d"] } : one)) };
    expect(planEveryWeek({ ...base, batches: [batchLonger] })?.skipped).toContainEqual({ weekFrom: "2026-11-23", reason: "extra", count: 1 });
  });

  it("counts a topic written in place of a dropped one, and not a dropped one", () => {
    const batch = plan({
      edit: (posts) => [...movedFirstWeek(posts).map((one) => (one.id === "w0b" ? { ...one, state: "dropped" as const, replacedBy: "w0b-r" } : one)), post("w0b-r", "2026-11-17", "pending", { replaces: "w0b" })],
    });
    const withReplacement = { ...batch, weeks: (batch.weeks ?? []).map((one) => (one.from === "2026-11-16" ? { ...one, postIds: ["w0a", "w0b", "w0b-r", "w0c"] } : one)) };
    expect(planEveryWeek({ ...base, batches: [withReplacement] })?.days).toEqual(["tue", "wed", "thu"]);
  });

  it("has no plan for a week that is not there or has no topics", () => {
    expect(planEveryWeek({ ...base, weekFrom: "2027-01-04", batches: [plan()] })).toBeNull();
    expect(planEveryWeek({ ...base, batchId: "nope", batches: [plan()] })).toBeNull();
  });
});

describe("the words about it", () => {
  it("names the days in week order", () => {
    expect(daysWords(["tue", "wed", "thu"])).toBe("Tue, Wed and Thu");
    expect(daysWords(["mon"])).toBe("Mon");
    expect(daysWords(["mon", "fri"])).toBe("Mon and Fri");
  });

  it("says what changed, what stayed and why, and the topics that name a day", () => {
    const result = planEveryWeek({ ...base, today: "2026-11-14", batches: [plan({ weeks: { 3: "drawn" }, edit: movedFirstWeek })] });
    if (result === null) throw new Error("no plan");
    expect(everyWeekSummary(result, { weeksChanged: 2, namesADay: 2, failed: 0, saved: true })).toBe("Every week now uses Tue, Wed and Thu. 2 other weeks changed. The week of 7 Dec is already drawn, so it stays. 2 topics name a day: read their words again.");
    expect(everyWeekSummary({ ...result, skipped: [] }, { weeksChanged: 0, namesADay: 0, failed: 1, saved: false })).toBe("Every week now uses Tue, Wed and Thu. The other weeks already had these days. 1 topic could not be moved just now. The next plan could not be set to these days just now.");
  });
});
