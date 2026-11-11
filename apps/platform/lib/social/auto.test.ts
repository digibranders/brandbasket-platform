import { describe, expect, it } from "vitest";
import {
  allPaused,
  canChange,
  channelIdsOf,
  bookedUntil,
  connectStatus,
  daysUntilEnd,
  endingSoon,
  endsInWords,
  loadWindow,
  monthGrid,
  nextPostDay,
  hourLabel,
  initialOf,
  platformsOf,
  postToShow,
  postStatus,
  readChannels,
  readNotices,
  readWebsite,
  websiteLabel,
  readConnectLink,
  readPosts,
  shiftMonth,
  time12,
  toCalendarPost,
  weekOf,
  type AutoChannel,
  type CalendarPost,
  type ChannelPlatform,
} from "./auto";

const NOW = new Date("2026-11-02T05:00:00.000Z");
const ALL: ReadonlySet<ChannelPlatform> = new Set(["instagram", "facebook", "linkedin"]);

const channel = (overrides: Partial<AutoChannel> = {}): AutoChannel => ({ id: "instagram:1", platform: "instagram", account: "acme_foods", connectedAt: "2026-10-30T09:00:00Z", ...overrides });
const post = (overrides: Partial<CalendarPost> = {}): CalendarPost => ({
  id: "p1",
  day: "2026-11-04",
  time: "10:00",
  caption: "Fresh sourdough every morning.",
  state: "scheduled",
  manual: false,
  channels: [{ platform: "instagram", account: "acme_foods", state: "scheduled", permalink: null }],
  ...overrides,
});

describe("reading what social-auto answers", () => {
  it("keeps the channels it knows and drops one it does not, instead of failing the list", () => {
    const body = { workspace: { channels: [channel(), { id: "tiktok:1", platform: "tiktok", account: "x", connectedAt: "t" }, { id: "broken" }] } };
    expect(readChannels(body).map((c) => c.id)).toEqual(["instagram:1"]);
    expect(readChannels({ workspace: { channels: [{ id: "google:100", platform: "google", account: "Test Cafe", connectedAt: "t" }] } }).map((c) => c.platform)).toEqual(["google"]);
    expect(readChannels(null)).toEqual([]);
    expect(readChannels({ workspace: { channels: "nope" } })).toEqual([]);
  });

  it("reads posts, and leaves out one that is not a post", () => {
    const body = { posts: [{ id: "a", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: false, state: "scheduled", channels: [] }, { id: "b" }] };
    expect(readPosts(body).map((p) => p.id)).toEqual(["a"]);
    expect(readPosts({})).toEqual([]);
  });

  it("accepts a connect link only when it is https, or http on this machine", () => {
    expect(readConnectLink({ url: "https://social.example/api/instagram-start?invite=x" })).toBe("https://social.example/api/instagram-start?invite=x");
    expect(readConnectLink({ url: "http://localhost:4010/api/facebook-start?invite=x" })).toContain("localhost:4010");
    expect(readConnectLink({ url: "http://evil.example/x" })).toBeNull();
    expect(readConnectLink({ url: "javascript:alert(1)" })).toBeNull();
    expect(readConnectLink({ url: 5 })).toBeNull();
    expect(readConnectLink(null)).toBeNull();
  });
});

describe("placing a post on the calendar", () => {
  it("reads its day and time in India", () => {
    const at = { id: "a", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: false, state: "scheduled" as const, channels: [] };
    expect(toCalendarPost(at)).toMatchObject({ day: "2026-11-04", time: "10:00" });
    expect(toCalendarPost({ ...at, date: "2026-11-04T20:00:00Z" })).toMatchObject({ day: "2026-11-05", time: "01:30" });
    expect(toCalendarPost({ ...at, date: "soon" })).toBeNull();
  });

  it("loads four weeks back and thirteen weeks from this week's Monday", () => {
    expect(loadWindow("2026-11-04")).toEqual({ from: "2026-10-05", to: "2027-01-31" });
  });
});

describe("connections that end", () => {
  it("counts whole days, and only a connection with an end date can end", () => {
    expect(daysUntilEnd({ expiresAt: "2026-11-07T06:00:00.000Z" }, NOW)).toBe(5);
    expect(daysUntilEnd({}, NOW)).toBeNull();
    expect(daysUntilEnd({ expiresAt: "later" }, NOW)).toBeNull();
    expect(endingSoon({ expiresAt: "2026-11-09T05:00:00.000Z" }, NOW)).toBe(true);
    expect(endingSoon({ expiresAt: "2026-11-10T05:00:00.000Z" }, NOW)).toBe(false);
    expect(endingSoon({}, NOW)).toBe(false);
  });

  it("says it in plain words", () => {
    expect(endsInWords(5)).toBe("Ends in 5 days");
    expect(endsInWords(1)).toBe("Ends in 1 day");
    expect(endsInWords(0)).toBe("Ends today");
    expect(endsInWords(-2)).toBe("The connection has ended");
  });
});

describe("the status card", () => {
  it("asks for the accounts first when none is connected", () => {
    const status = connectStatus([], [], NOW);
    expect(status).toMatchObject({ title: "Let us start your social posts", action: { kind: "channels" }, actionLabel: "Connect your accounts" });
  });

  it("puts a connection that ends soon before everything else, with the button to renew it", () => {
    const status = connectStatus([channel(), channel({ id: "linkedin:9", platform: "linkedin", account: "Meera Nair", expiresAt: "2026-11-07T06:00:00.000Z" })], [post()], NOW);
    expect(status.title).toBe("LinkedIn needs you again soon");
    expect(status.text).toContain("ends in 5 days");
    expect(status.action).toEqual({ kind: "connect", platform: "linkedin" });
    expect(status.actionLabel).toBe("Reconnect LinkedIn");
  });

  it("says plainly when a connection has already ended", () => {
    const status = connectStatus([channel({ platform: "linkedin", id: "linkedin:9", expiresAt: "2026-11-01T05:00:00.000Z" })], [], NOW);
    expect(status.title).toBe("LinkedIn needs you again");
    expect(status.text).toContain("has ended");
  });

  it("names the next post that has not gone out, and has no button when nothing is needed", () => {
    const status = connectStatus([channel()], [post({ id: "old", day: "2026-11-02", state: "published" }), post({ id: "later", day: "2026-11-06" }), post()], NOW);
    expect(status.title).toBe("We are posting for you");
    expect(status.text).toBe("Your next post goes out on Wednesday 4 November at 10:00. Nothing is needed from you right now.");
    expect(status.action).toBeNull();
    expect(status.actionLabel).toBeNull();
  });

  it("says the next posts are being written when none is booked", () => {
    expect(connectStatus([channel()], [], NOW).text).toContain("We are writing your next posts");
  });
});

describe("where a post stands", () => {
  const states = (...list: Array<["instagram" | "facebook" | "linkedin", "scheduled" | "due" | "published" | "missed"]>): CalendarPost["channels"] => list.map(([platform, state]) => ({ platform, account: platform, state, permalink: null }));

  it("is Posted only when every channel being looked at has it", () => {
    expect(postStatus(post({ channels: states(["instagram", "published"], ["facebook", "published"]) }), ALL)).toEqual({ tone: "ok", word: "Posted", state: "published" });
    expect(postStatus(post({ channels: states(["instagram", "published"], ["facebook", "scheduled"]) }), ALL)).toEqual({ tone: "info", word: "Scheduled", state: "scheduled" });
  });

  it("names the network that missed its day", () => {
    const channels = states(["instagram", "published"], ["linkedin", "missed"]);
    expect(postStatus(post({ channels }), ALL)).toEqual({ tone: "warn", word: "Not sent to LinkedIn", state: "missed" });
    expect(postStatus(post({ channels: states(["instagram", "missed"]) }), ALL)).toEqual({ tone: "warn", word: "Not sent", state: "missed" });
  });

  it("follows the channels switched on: a post on none of them is hidden, and a missed channel switched off is not counted", () => {
    const channels = states(["instagram", "published"], ["linkedin", "missed"]);
    expect(postStatus(post({ channels }), new Set(["instagram"]))).toEqual({ tone: "ok", word: "Posted", state: "published" });
    expect(postStatus(post({ channels }), new Set(["facebook"]))).toBeNull();
  });

  it("says Going out for a post whose day has come, and uses its own state when it has no channel yet", () => {
    expect(postStatus(post({ channels: states(["instagram", "due"]) }), ALL)).toEqual({ tone: "info", word: "Going out", state: "due" });
    expect(postStatus(post({ channels: [], state: "missed" }), ALL)).toEqual({ tone: "warn", word: "Not sent", state: "missed" });
    expect(postStatus(post({ channels: [], state: "scheduled" }), ALL)).toEqual({ tone: "info", word: "Scheduled", state: "scheduled" });
  });

  it("lists each network a post goes to once, in the page's order", () => {
    expect(platformsOf(post({ channels: states(["linkedin", "scheduled"], ["instagram", "scheduled"], ["instagram", "scheduled"]) }))).toEqual(["instagram", "linkedin"]);
  });
});

describe("the calendar's days", () => {
  it("gives the seven days of a week from Monday", () => {
    expect(weekOf("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  it("gives whole weeks for a month, and moves to the next and the previous month", () => {
    const grid = monthGrid("2026-11-04");
    expect(grid[0]).toBe("2026-10-26");
    expect(grid).toHaveLength(42);
    expect(grid[grid.length - 1]).toBe("2026-12-06");
    expect(monthGrid("2026-12-10")).toHaveLength(35);
    expect(monthGrid("2027-02-10")).toHaveLength(28);
    expect(shiftMonth("2026-11-20", 1)).toBe("2026-12-01");
    expect(shiftMonth("2026-01-20", -1)).toBe("2025-12-01");
  });

  it("finds the last booked day from today on", () => {
    expect(bookedUntil([post({ day: "2026-11-30" }), post({ day: "2026-11-04" }), post({ day: "2026-10-01" })], "2026-11-02")).toBe("2026-11-30");
    expect(bookedUntil([post({ day: "2026-10-01" })], "2026-11-02")).toBeNull();
  });
});

describe("the words on the calendar", () => {
  it("writes a time and an hour the way the team calendar does", () => {
    expect([time12("10:00"), time12("00:05"), time12("12:30"), time12("13:45"), time12("23:59")]).toEqual(["10:00 AM", "12:05 AM", "12:30 PM", "1:45 PM", "11:59 PM"]);
    expect([hourLabel(0), hourLabel(8), hourLabel(12), hourLabel(15)]).toEqual(["12 AM", "8 AM", "12 PM", "3 PM"]);
  });

  it("marks a post with the first letter of the account it goes to, or a fallback", () => {
    expect(initialOf(post({ channels: [{ platform: "instagram", account: "acme_foods", state: "scheduled", permalink: null }] }), "O")).toBe("A");
    expect(initialOf(post({ channels: [] }), "o")).toBe("O");
  });
});

describe("where the calendar opens", () => {
  it("opens on the first day from today that has a post, or on today when none is booked", () => {
    const posts = [post({ day: "2026-10-30" }), post({ day: "2026-11-09" }), post({ day: "2026-11-04" })];
    expect(nextPostDay(posts, "2026-11-02")).toBe("2026-11-04");
    expect(nextPostDay(posts, "2026-11-04")).toBe("2026-11-04");
    expect(nextPostDay(posts, "2026-11-10")).toBe("2026-11-10");
    expect(nextPostDay([], "2026-11-02")).toBe("2026-11-02");
  });

  it("brings the next post at or after now into view, else the first one shown", () => {
    const at = (day: string, time: string) => ({ post: { day, time } });
    const shown = [at("2026-11-06", "10:00"), at("2026-11-04", "15:30"), at("2026-11-04", "10:00")];
    expect(postToShow(shown, "2026-11-04T12:00")).toBe(shown[1]);
    expect(postToShow(shown, "2026-11-04T10:00")).toBe(shown[2]);
    expect(postToShow(shown, "2026-11-08T09:00")).toBe(shown[2]);
    expect(postToShow(shown, null)).toBe(shown[2]);
    expect(postToShow([], "2026-11-04T10:00")).toBeNull();
  });
});

describe("which posts the customer can still change", () => {
  const made = post({ manual: true, state: "scheduled", channels: [{ id: "instagram:1", platform: "instagram", account: "acme_foods", state: "scheduled", permalink: null }] });

  it("is the ones they made, that have not started going out, whose accounts are known", () => {
    expect(canChange(made)).toBe(true);
    expect(channelIdsOf(made)).toEqual(["instagram:1"]);
    expect(canChange({ ...made, manual: false })).toBe(false);
    expect(canChange({ ...made, state: "due" })).toBe(false);
    expect(canChange({ ...made, state: "published" })).toBe(false);
    expect(canChange({ ...made, channels: [{ platform: "instagram", account: "acme_foods", state: "scheduled", permalink: null }] })).toBe(false);
  });
});

describe("posts that are skipped or paused", () => {
  const on = (state: "scheduled" | "due" | "published" | "missed" | "skipped" | "paused", id = "instagram:1"): CalendarPost["channels"][number] => ({ id, platform: "instagram", account: "acme", state, permalink: null });
  const withChannels = (...channels: CalendarPost["channels"]): CalendarPost => post({ manual: true, state: "scheduled", channels });

  it("says Skipped, or Paused, in a word, and a skipped channel does not stop a post from being Posted", () => {
    expect(postStatus(withChannels(on("skipped")), ALL)).toMatchObject({ word: "Skipped", state: "skipped" });
    expect(postStatus(withChannels(on("paused")), ALL)).toMatchObject({ word: "Paused", state: "paused" });
    expect(postStatus(withChannels(on("paused"), { ...on("scheduled"), platform: "facebook", id: "facebook:2" }), ALL)).toMatchObject({ word: "Paused" });
    expect(postStatus(withChannels(on("published"), { ...on("skipped"), platform: "facebook", id: "facebook:2" }), ALL)).toMatchObject({ word: "Posted" });
    expect(postStatus(withChannels(on("paused"), { ...on("due"), platform: "facebook", id: "facebook:2" }), ALL)).toMatchObject({ word: "Going out" });
    expect(postStatus(post({ channels: [], state: "skipped" }), ALL)).toMatchObject({ word: "Skipped" });
    expect(postStatus(post({ channels: [], state: "paused" }), ALL)).toMatchObject({ word: "Paused" });
  });

  it("can still be edited while paused, but not once skipped", () => {
    expect(canChange({ ...withChannels(on("paused")), state: "paused" })).toBe(true);
    expect(canChange({ ...withChannels(on("skipped")), state: "skipped" })).toBe(false);
  });

  it("is read from social-auto's answer", () => {
    const body = { posts: [{ id: "a", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: false, state: "paused", channels: [{ platform: "instagram", account: "x", state: "skipped", permalink: null }] }] };
    expect(readPosts(body)[0]?.state).toBe("paused");
    expect(readPosts(body)[0]?.channels[0]?.state).toBe("skipped");
  });
});

describe("when posting is paused for the business", () => {
  it("is only when it has accounts and every one is held back", () => {
    expect(allPaused([])).toBe(false);
    expect(allPaused([channel({ paused: true })])).toBe(true);
    expect(allPaused([channel({ paused: true }), channel({ id: "facebook:2", paused: false })])).toBe(false);
    expect(allPaused([channel({ paused: true }), channel({ id: "facebook:2" })])).toBe(false);
  });

  it("reads the paused flag of a channel", () => {
    const body = { workspace: { channels: [{ id: "facebook:2", platform: "facebook", account: "P", connectedAt: "t", paused: true }, { id: "instagram:1", platform: "instagram", account: "I", connectedAt: "t" }] } };
    expect(readChannels(body).map((c) => c.paused)).toEqual([true, undefined]);
  });
});

describe("the website a workspace is locked to", () => {
  it("reads it from the workspace answer, and is null before the first job or for anything else", () => {
    expect(readWebsite({ workspace: { website: " https://omsweets.in " } })).toBe("https://omsweets.in");
    expect(readWebsite({ workspace: { website: null } })).toBeNull();
    expect(readWebsite({ workspace: { website: "  " } })).toBeNull();
    expect(readWebsite(null)).toBeNull();
  });

  it("shows an address without https, www and the trailing slash", () => {
    expect(websiteLabel("https://www.omsweets.in/")).toBe("omsweets.in");
    expect(websiteLabel("http://omsweets.in/shop")).toBe("omsweets.in/shop");
  });
});

describe("notices and posts held for a disconnected account", () => {
  it("reads the notices of a workspace and drops what is not one", () => {
    const body = { workspace: { notices: [{ code: "ACCOUNT_DISCONNECTED", platform: "facebook", message: "Your Facebook account is not connected." }, { nope: true }, { code: "X", message: "No platform." }] } };
    expect(readNotices(body)).toEqual([{ code: "ACCOUNT_DISCONNECTED", platform: "facebook", message: "Your Facebook account is not connected." }, { code: "X", platform: null, message: "No platform." }]);
    expect(readNotices(null)).toEqual([]);
  });

  it("shows a held network from the targets when the service sends them, and the channels otherwise", () => {
    const base = { id: "p", date: "2026-11-14T15:30:00+05:30", caption: "x", manual: false, state: "scheduled", channels: [{ id: "instagram:1", platform: "instagram", account: "acme", state: "scheduled", permalink: null }] };
    const targets = [{ id: "instagram:1", platform: "instagram", account: "acme", state: "scheduled" }, { id: "linkedin", platform: "linkedin", account: null, state: "held", code: "ACCOUNT_DISCONNECTED" }];
    expect(readPosts({ posts: [{ ...base, targets }] })[0]?.channels.map((c) => `${c.platform}:${c.state}`)).toEqual(["instagram:scheduled", "linkedin:held"]);
    expect(readPosts({ posts: [base] })[0]?.channels.map((c) => c.platform)).toEqual(["instagram"]);
  });

  it("keeps a post whose network has no connected account, held, instead of dropping the whole post", () => {
    const [post] = readPosts({ posts: [{ id: "p", date: "2026-11-14T15:30:00+05:30", caption: "x", manual: false, state: "scheduled", channels: [{ id: "instagram:1", platform: "instagram", account: "acme", state: "scheduled", permalink: null }, { id: "facebook", platform: "facebook", account: null, state: "held", permalink: null, code: "ACCOUNT_DISCONNECTED" }] }] });
    const calendar = post === undefined ? null : toCalendarPost(post);
    expect(calendar?.channels.map((c) => c.account)).toEqual(["acme", "Not connected"]);
    expect(postStatus(calendar as NonNullable<typeof calendar>, new Set(["facebook"]))).toMatchObject({ state: "held", word: "On hold: connect Facebook" });
    expect(postStatus(calendar as NonNullable<typeof calendar>, new Set(["instagram", "facebook"]))).toMatchObject({ state: "scheduled" });
  });
});
