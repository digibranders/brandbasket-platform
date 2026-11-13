import { describe, expect, it } from "vitest";
import { audienceLabel, changeOf, channelFrom, channelState, daysWithData, headlineOf, postingServiceSettings, rangeFrom, readAnalytics, sumOver, totalOver, windowsOf } from "./rules";

const answer = {
  checkedAt: "2026-11-11T02:00:00Z",
  channels: [
    { channel: "instagram:1", platform: "instagram", label: "acme", status: "ok", lastCheckedAt: "2026-11-11T02:00:00Z" },
    { channel: "facebook:1", platform: "facebook", status: "reconnect", lastCheckedAt: null },
    { channel: "tiktok:1", platform: "tiktok", status: "ok" },
  ],
  posts: [{ postId: "p1", channel: "instagram:1", platform: "instagram", permalink: "https://instagram.com/p/x", postedAt: "2026-11-09T10:00:00.000Z", caption: "Hi #diwali", total: { likes: 7 }, series: [{ date: "2026-11-09", likes: 7 }, { date: "bad", likes: 1 }] }, { nope: true }],
  accounts: [{ channel: "google:1", platform: "google", series: [{ date: "2026-11-10", views: 40, calls: 2 }], searchTerms: [{ term: "sweets near me", impressions: 86 }] }],
  audience: { instagram: { status: "ok", age: [{ label: "25-34", value: 41 }] } },
  hashtags: [{ tag: "#Sweets", posts: 9, avgReach: 1840 }],
};

describe("readAnalytics", () => {
  it("reads the numbers and drops what is not a network we know or a number we can read", () => {
    const read = readAnalytics(answer);
    expect(read?.channels.map((one) => one.channel)).toEqual(["instagram:1", "facebook:1"]);
    expect(read?.posts).toHaveLength(1);
    expect(read?.posts[0]?.series).toHaveLength(1);
    expect(read?.accounts[0]?.series[0]).toMatchObject({ views: 40, calls: 2 });
    expect(read?.accounts[0]?.searchTerms[0]?.impressions).toBe(86);
    expect(read?.audience?.age?.[0]?.value).toBe(41);
  });

  it("keeps a number a network did not give absent, not zero", () => {
    expect(readAnalytics(answer)?.posts[0]?.total).toEqual({ likes: 7 });
  });

  it("reads the audience reasons", () => {
    expect(readAnalytics({ audience: { instagram: { status: "too_few_followers", followers: 64 } } })?.audience).toMatchObject({ status: "too_few_followers", followers: 64 });
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

describe("days and sums", () => {
  it("lays out the range ending today and the range before it, oldest first, across a year end", () => {
    const w = windowsOf(7, "2026-11-11");
    expect(w.current[0]).toBe("2026-11-05");
    expect(w.current[6]).toBe("2026-11-11");
    expect(w.previous[0]).toBe("2026-10-29");
    expect(w.from).toBe("2026-10-29");
    expect(windowsOf(30, "2026-01-05").current[0]).toBe("2025-12-07");
  });

  it("sums only the days asked for, and says nothing when no day has the number", () => {
    const series = [{ date: "2026-11-09", reach: 10 }, { date: "2026-11-10", reach: 5 }, { date: "2026-11-01", reach: 100 }];
    expect(sumOver(series, ["2026-11-09", "2026-11-10"], (d) => d.reach)).toBe(15);
    expect(sumOver(series, ["2026-11-02"], (d) => d.reach)).toBeUndefined();
  });

  it("counts the days that have a reading", () => {
    expect(daysWithData([{ date: "2026-11-09", reach: 1 }, { date: "2026-11-10" }, { date: "2026-11-01", reach: 2 }], ["2026-11-09", "2026-11-10"], (d) => (d as { reach?: number }).reach)).toBe(1);
  });

  it("gives the change on the period before in whole percent, and none without something to compare", () => {
    expect(changeOf(120, 100)).toBe(20);
    expect(changeOf(80, 100)).toBe(-20);
    expect(changeOf(5, 0)).toBeNull();
    expect(changeOf(undefined, 10)).toBeNull();
  });

  it("totals the posts that went out on the days given", () => {
    const read = readAnalytics(answer);
    expect(read && totalOver(read.posts, ["2026-11-09"], ["likes", "comments"])).toBe(7);
    expect(read && totalOver(read.posts, ["2026-11-08"], ["likes"])).toBeUndefined();
  });
});

describe("words and the address", () => {
  it("puts the labels Instagram gives into plain words", () => {
    expect(audienceLabel("F")).toBe("Women");
    expect(audienceLabel("M")).toBe("Men");
    expect(audienceLabel("25-34")).toBe("25 to 34");
    expect(audienceLabel("65+")).toBe("65 and over");
    expect(audienceLabel("Pune")).toBe("Pune");
  });

  it("names a post by the first line of its caption, kept short", () => {
    expect(headlineOf("Diwali boxes\n#diwali")).toBe("Diwali boxes");
    expect(headlineOf(null)).toBe("Post");
    expect(headlineOf("x".repeat(100))).toHaveLength(70);
  });

  it("accepts only the range and channel we offer", () => {
    expect(rangeFrom("7")).toBe(7);
    expect(rangeFrom("1000")).toBe(30);
    expect(channelFrom("google")).toBe("google");
    expect(channelFrom("linkedin")).toBe("all");
  });

  it("finds the posting service only when both its address and key are set", () => {
    expect(postingServiceSettings({})).toBeNull();
    expect(postingServiceSettings({ SOCIAL_AUTO_URL: "http://127.0.0.1:4020/", SOCIAL_AUTO_KEY: " k " })).toEqual({ url: "http://127.0.0.1:4020", key: "k" });
    expect(postingServiceSettings({ SOCIAL_AUTO_URL: "not a url", SOCIAL_AUTO_KEY: "k" })).toBeNull();
    expect(postingServiceSettings({ SOCIAL_AUTO_URL: "http://127.0.0.1:4020" })).toBeNull();
  });
});
