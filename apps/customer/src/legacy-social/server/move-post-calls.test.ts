import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { movePost, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const post = { id: "b-w01-d1~linkedin", date: "2026-11-06T16:30:00+05:30", caption: "c", manual: false, state: "scheduled", channels: [] };
const answer = () => vi.fn(async () => new Response(JSON.stringify({ post }), { status: 200 })) as unknown as typeof fetch;
const sentBody = (send: typeof fetch): Record<string, unknown> => JSON.parse(String(vi.mocked(send).mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

describe("moving a post", () => {
  it("moves every network of the post when no network is named", async () => {
    const send = answer();
    await movePost(settings, "b1", "b-w01-d1", { day: "2026-11-06", time: "16:30" }, send);
    expect(sentBody(send)).toEqual({ day: "2026-11-06", time: "16:30" });
  });

  it("names the network when only that network's time changes", async () => {
    const send = answer();
    await movePost(settings, "b1", "b-w01-d1", { day: "2026-11-06", time: "16:30", network: "linkedin" }, send);
    expect(sentBody(send)).toEqual({ day: "2026-11-06", time: "16:30", network: "linkedin" });
    expect(String(vi.mocked(send).mock.calls[0]?.[0])).toContain("postId=b-w01-d1");
  });
});
