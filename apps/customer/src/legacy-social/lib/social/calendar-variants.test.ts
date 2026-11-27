import { describe, expect, it } from "vitest";
import { toCalendarPost, type AutoPost } from "./auto";

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
