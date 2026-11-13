import { describe, expect, it } from "vitest";
import { readAnalytics, windowsOf } from "./rules";
import { audienceOf, noticesFor, overviewOf, postRows, standingOf } from "./view";

const TODAY = "2026-11-11";
const w = windowsOf(7, TODAY);
const series = (days: readonly string[], per: (i: number) => object) => days.map((date, i) => ({ date, ...per(i) }));

const read = readAnalytics({
  channels: [
    { channel: "instagram:1", platform: "instagram", status: "ok" },
    { channel: "facebook:7", platform: "facebook", status: "reconnect" },
    { channel: "google:9", platform: "google", status: "ok" },
  ],
  posts: [
    { postId: "a", channel: "instagram:1", platform: "instagram", postedAt: `${w.current[2]}T10:00:00.000Z`, caption: "Diwali boxes", total: { reach: 100, likes: 10, comments: 2, shares: 3, saves: 4 } },
    { postId: "b", channel: "instagram:1", platform: "instagram", postedAt: `${w.current[3]}T10:00:00.000Z`, caption: "Second", total: { reach: 300, likes: 5 } },
    { postId: "c", channel: "facebook:7", platform: "facebook", postedAt: `${w.current[1]}T10:00:00.000Z`, caption: "Fb", total: { likes: 1 } },
  ],
  accounts: [
    { channel: "instagram:1", platform: "instagram", series: series(w.current, () => ({ reach: 10 })) },
    { channel: "google:9", platform: "google", series: series(w.current, () => ({ views: 5, calls: 1 })), searchTerms: [{ term: "sweets", impressions: 9 }, { term: "mithai", impressions: 20 }] },
  ],
  audience: { instagram: { status: "ok", gender: [{ label: "F", value: 58 }] } },
  hashtags: [],
});

describe("overviewOf", () => {
  it("sums account numbers over the range and leaves out a number nothing gives", () => {
    const o = overviewOf(read!, ["instagram", "facebook", "google"], 7, TODAY);
    const labels = o.figures.map((f) => f.label);
    expect(labels).toEqual(["Reach", "Likes and comments", "Shares and saves"]);
    expect(o.figures[0]?.value).toBe(70);
    expect(o.figures[1]?.value).toBe(18);
  });

  it("draws no change against a period that was not mostly counted", () => {
    expect(overviewOf(read!, ["instagram"], 7, TODAY).figures[0]?.change).toBeNull();
  });

  it("draws one point for each day that has a reading, never a zero for a day without", () => {
    const o = overviewOf(read!, ["instagram"], 7, TODAY);
    expect(o.reach.days).toHaveLength(7);
    const gap = readAnalytics({ channels: [{ channel: "instagram:1", platform: "instagram", status: "ok" }], accounts: [{ channel: "instagram:1", platform: "instagram", series: [{ date: w.current[0], reach: 4 }] }] });
    expect(overviewOf(gap!, ["instagram"], 7, TODAY).reach.days).toEqual([w.current[0]]);
  });

  it("gives the Google listing its own numbers and its top search terms, most searched first", () => {
    const g = overviewOf(read!, ["google"], 7, TODAY).google;
    expect(g?.figures.map((f) => f.label)).toEqual(["Views on Maps and Search", "Calls"]);
    expect(g?.terms.map((t) => t.label)).toEqual(["mithai", "sweets"]);
  });

  it("says nothing about a network that is waiting for its first check or is not connected", () => {
    const waiting = readAnalytics({ channels: [{ channel: "instagram:1", platform: "instagram", status: "waiting" }] });
    expect(overviewOf(waiting!, ["instagram", "facebook", "google"], 7, TODAY).figures).toEqual([]);
    expect(overviewOf(waiting!, ["instagram"], 7, TODAY).google).toBeNull();
  });
});

describe("notices, posts and audience", () => {
  it("lists the networks that need a new permission, and those still waiting", () => {
    expect(noticesFor(read!, ["instagram", "facebook", "google"])).toEqual({ reconnect: ["facebook"], waiting: [] });
    expect(standingOf(read!, "instagram")).toBe("ok");
    expect(standingOf(readAnalytics({ channels: [] })!, "google")).toBe("not_connected");
  });

  it("orders posts by how many people they reached and leaves Google out", () => {
    expect(postRows(read!, ["instagram", "facebook", "google"]).map((r) => r.title)).toEqual(["Second", "Diwali boxes", "Fb"]);
    expect(postRows(read!, ["facebook"]).map((r) => r.title)).toEqual(["Fb"]);
  });

  it("puts audience labels in plain words and says why there is none", () => {
    expect(audienceOf(read!).groups[0]).toEqual({ title: "Gender", rows: [{ label: "Women", value: 58 }] });
    expect(audienceOf(readAnalytics({ audience: { instagram: { status: "too_few_followers", followers: 64 } } })!)).toMatchObject({ status: "too_few_followers", followers: 64, groups: [] });
    expect(audienceOf(readAnalytics({})!).status).toBe("none");
  });
});
