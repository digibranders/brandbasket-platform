import { describe, expect, it } from "vitest";
import { toCalendarPost, viewForChannels, type AutoPost, type CalendarPost } from "./auto";

const post = (variants: AutoPost["variants"]): AutoPost => ({ id: "b-w01-d1", date: "2026-11-30T10:00:00+05:30", caption: "Main", manual: false, state: "scheduled", channels: [], imageUrl: "https://x.example/posts/main.png", variants }) as unknown as AutoPost;

describe("toCalendarPost variants", () => {
  it("carries a network's own picture to the calendar post, with or without its own caption", () => {
    const both = toCalendarPost(post({ linkedin: { caption: "Own words", imageUrl: "https://x.example/posts/li.png" } }));
    expect(both?.variants).toEqual({ linkedin: "Own words" });
    expect(both?.variantImages).toEqual({ linkedin: "https://x.example/posts/li.png" });
    const pictureOnly = toCalendarPost(post({ linkedin: { imageUrl: "https://x.example/posts/li.png" } }));
    expect(pictureOnly?.variants).toBeUndefined();
    expect(pictureOnly?.variantImages).toEqual({ linkedin: "https://x.example/posts/li.png" });
  });

  it("has no variant fields for a post whose networks share the main picture and words", () => {
    const plain = toCalendarPost(post(undefined));
    expect(plain?.variantImages).toBeUndefined();
    expect(plain?.variants).toBeUndefined();
  });
});

const both = {
  id: "b-w01-d1",
  day: "2026-11-30",
  time: "10:00",
  caption: "Instagram words.",
  state: "scheduled",
  manual: false,
  imageUrl: "https://x.example/posts/ig.png",
  variants: { linkedin: "LinkedIn words." },
  variantImages: { linkedin: "https://x.example/posts/li.png" },
  channels: [
    { platform: "instagram", account: "alsonotify", state: "scheduled", permalink: null },
    { platform: "linkedin", account: "Steff Jay", state: "scheduled", permalink: null },
  ],
} as unknown as CalendarPost;

describe("viewForChannels", () => {
  it("makes it that network's own post when only that network is shown: its words, its picture, its account", () => {
    const view = viewForChannels(both, new Set(["linkedin"]));
    expect(view.caption).toBe("LinkedIn words.");
    expect(view.imageUrl).toBe("https://x.example/posts/li.png");
    expect(view.channels.map((channel) => channel.platform)).toEqual(["linkedin"]);
    expect(view.variants).toBeUndefined();
    expect(view.variantImages).toBeUndefined();
    expect(view.id).toBe(both.id);
  });

  it("gives Instagram the main words and picture, and a network with none of its own the main ones too", () => {
    const instagram = viewForChannels(both, new Set(["instagram"]));
    expect([instagram.caption, instagram.imageUrl, instagram.channels.length]).toEqual(["Instagram words.", "https://x.example/posts/ig.png", 1]);
    const facebook = viewForChannels({ ...both, channels: [...both.channels, { platform: "facebook", account: "Page", state: "scheduled", permalink: null }] } as unknown as CalendarPost, new Set(["facebook"]));
    expect([facebook.caption, facebook.imageUrl]).toEqual(["Instagram words.", "https://x.example/posts/ig.png"]);
  });

  it("leaves the post as it is when more than one network is shown", () => {
    expect(viewForChannels(both, new Set(["instagram", "linkedin"]))).toBe(both);
  });
});
