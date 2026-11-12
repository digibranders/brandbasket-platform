import { describe, expect, it } from "vitest";
import { audienceLabel, changeOf, daysWithData, channelFrom, channelState, perDay, rangeFrom, readAnalytics, sumOver, tabFrom, totalOver, windowsOf } from "./analytics";

describe("readAnalytics", () => {
  const answer = {
    checkedAt: "2026-11-11T02:00:00Z",
    channels: [
      { channel: "instagram:1", platform: "instagram", label: "acme", status: "ok", lastCheckedAt: "2026-11-11T02:00:00Z" },
      { channel: "facebook:1", platform: "facebook", status: "reconnect", lastCheckedAt: null },
      { channel: "tiktok:1", platform: "tiktok", status: "ok" },
    ],
    posts: [{ postId: "p1", channel: "instagram:1", platform: "instagram", permalink: "https://instagram.com/p/x", postedAt: "2026-11-09T10:00:00.000Z", caption: "Hi #diwali", total: { likes: 7 }, series: [{ date: "2026-11-09", likes: 7 }, { date: "bad", likes: 1 }] }, { nope: true }],
    accounts: [{ channel: "google:1", platform: "google", series: [{ date: "2026-11-10", views: 40, calls: 2 }], searchTerms: [{ term: "sweets near me", impressions: 86 }] }],
    audience: { instagram: { status: "ok", age: [{ label: "25 to 34", value: 41 }] } },
    hashtags: [{ tag: "#Sweets", posts: 9, avgReach: 1840 }],
  };

  it("reads the numbers and drops what is not a network we know or a number we can read", () => {
    const read = readAnalytics(answer);
    expect(read?.channels.map((c) => c.channel)).toEqual(["instagram:1", "facebook:1"]);
    expect(read?.posts).toHaveLength(1);
    expect(read?.posts[0]?.series).toHaveLength(1);
    expect(read?.accounts[0]?.series[0]).toMatchObject({ views: 40, calls: 2 });
    expect(read?.accounts[0]?.searchTerms[0]?.impressions).toBe(86);
    expect(read?.audience?.age?.[0]?.value).toBe(41);
    expect(read?.hashtags[0]?.tag).toBe("#Sweets");
  });

  it("keeps a number a network did not give absent, not zero", () => {
    const post = readAnalytics(answer)?.posts[0];
    expect(post?.total.comments).toBeUndefined();
    expect(post?.total).toEqual({ likes: 7 });
  });

  it("reads the audience reasons and the post totals of a post made inside a window", () => {
    expect(readAnalytics({ audience: { instagram: { status: "too_few_followers", followers: 64 } } })?.audience).toMatchObject({ status: "too_few_followers", followers: 64 });
    const read = readAnalytics(answer);
    expect(read && totalOver(read.posts, ["2026-11-09"], ["likes", "comments"])).toBe(7);
    expect(read && totalOver(read.posts, ["2026-11-08"], ["likes"])).toBeUndefined();
  });

  it("is null for an answer that is not one, and empty lists for one with nothing", () => {
    expect(readAnalytics(null)).toBeNull();
    expect(readAnalytics("x")).toBeNull();
    expect(readAnalytics({})).toMatchObject({ posts: [], accounts: [], hashtags: [], channels: [] });
  });

  it("says where a network stands across its accounts, and a network not listed is waiting", () => {
    const read = readAnalytics(answer);
    expect(read && channelState(read, "instagram")).toBe("ok");
    expect(read && channelState(read, "facebook")).toBe("reconnect");
    expect(read && channelState(read, "google")).toBe("waiting");
  });
});

describe("the days and the sums", () => {
  it("lays out the range ending today and the range before it, oldest first", () => {
    const w = windowsOf(7, "2026-11-11");
    expect(w.current).toHaveLength(7);
    expect(w.current[0]).toBe("2026-11-05");
    expect(w.current[6]).toBe("2026-11-11");
    expect(w.previous[0]).toBe("2026-10-29");
    expect(w.previous[6]).toBe("2026-11-04");
    expect(w.from).toBe("2026-10-29");
  });

  it("crosses a month and a year end", () => {
    expect(windowsOf(30, "2026-01-05").current[0]).toBe("2025-12-07");
  });

  it("sums only the days asked for, and says nothing when no day has the number", () => {
    const series = [{ date: "2026-11-09", reach: 10 }, { date: "2026-11-10", reach: 5, views: 3 }, { date: "2026-11-01", reach: 100 }];
    expect(sumOver(series, ["2026-11-09", "2026-11-10"], (d) => d.reach)).toBe(15);
    expect(sumOver(series, ["2026-11-09", "2026-11-10"], (d) => (d as { views?: number }).views)).toBe(3);
    expect(sumOver(series, ["2026-11-02"], (d) => d.reach)).toBeUndefined();
  });

  it("gives a value for every day, a day with nothing being a gap, not zero", () => {
    expect(perDay([{ date: "2026-11-10", reach: 4 }], ["2026-11-09", "2026-11-10", "2026-11-11"], (d) => d.reach)).toEqual([null, 4, null]);
  });

  it("gives the change on the period before in whole percent, and none without something to compare", () => {
    expect(changeOf(120, 100)).toBe(20);
    expect(changeOf(80, 100)).toBe(-20);
    expect(changeOf(5, 0)).toBeNull();
    expect(changeOf(undefined, 10)).toBeNull();
    expect(changeOf(10, undefined)).toBeNull();
  });
});

describe("the address parameters", () => {
  it("accept only what we offer and fall back to the usual view", () => {
    expect(rangeFrom("7")).toBe(7);
    expect(rangeFrom("1000")).toBe(30);
    expect(rangeFrom(undefined)).toBe(30);
    expect(channelFrom("google")).toBe("google");
    expect(channelFrom("linkedin")).toBe("all");
    expect(tabFrom("audience")).toBe("audience");
    expect(tabFrom(["posts", "x"])).toBe("posts");
    expect(tabFrom("nope")).toBe("overview");
  });
});

describe("coverage and audience words", () => {
  it("counts the days that have a reading", () => {
    expect(daysWithData([{ date: "2026-11-09", reach: 1 }, { date: "2026-11-10" }, { date: "2026-11-01", reach: 2 }], ["2026-11-09", "2026-11-10"], (d) => (d as { reach?: number }).reach)).toBe(1);
  });

  it("puts the labels Instagram gives into plain words", () => {
    expect(audienceLabel("F")).toBe("Women");
    expect(audienceLabel("M")).toBe("Men");
    expect(audienceLabel("25-34")).toBe("25 to 34");
    expect(audienceLabel("65+")).toBe("65 and over");
    expect(audienceLabel("Pune")).toBe("Pune");
  });
});
