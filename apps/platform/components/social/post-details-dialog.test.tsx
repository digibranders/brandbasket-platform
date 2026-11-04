import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarPost } from "@/lib/social/auto";
import { PostDetailsDialog } from "./post-details-dialog";

const text = (post: CalendarPost): string => renderToStaticMarkup(createElement(PostDetailsDialog, { post, onClose: vi.fn() })).replaceAll("<!-- -->", "");

const post = (overrides: Partial<CalendarPost> = {}): CalendarPost => ({
  id: "manual-0123456789ab",
  day: "2026-11-03",
  time: "11:29",
  caption: "Fresh sourdough\nevery morning.",
  state: "published",
  manual: true,
  imageUrl: "https://social.example/api/edited-image?k=abc",
  channels: [
    { id: "instagram:1", platform: "instagram", account: "acme_foods", state: "published", permalink: "https://www.instagram.com/p/x/" },
    { id: "facebook:2", platform: "facebook", account: "Test Page", state: "published", permalink: "javascript:alert(1)" },
  ],
  ...overrides,
});

describe("a post opened to read", () => {
  it("shows the day and time, the words, the picture and where it went with how it is doing", () => {
    const html = text(post());
    expect(html).toContain("Tuesday 3 November at 11:29 AM");
    expect(html).toContain("Fresh sourdough\nevery morning.");
    expect(html).toContain("The picture of this post");
    expect(html).toContain("acme_foods");
    expect(html).toContain("Posted");
  });

  it("links to the post only when the address is a plain https one", () => {
    const html = text(post());
    expect(html).toContain('href="https://www.instagram.com/p/x/"');
    expect(html).not.toContain("javascript:");
    expect(html.match(/View post/g)).toHaveLength(1);
  });

  it("says why it cannot be changed, and offers to ask for a change only for a post we wrote", () => {
    expect(text(post())).toContain("This post has gone out, so it can no longer be changed.");
    expect(text(post())).not.toContain("Ask for a change");
    const planned = text(post({ manual: false, state: "scheduled" }));
    expect(planned).toContain("We wrote this post for you. To change it, ask us and we will.");
    expect(planned).toContain("Ask for a change");
    expect(text(post({ state: "due" }))).toContain("going out now");
    expect(text(post({ state: "missed" }))).toContain("could not be sent to every account");
  });
});
