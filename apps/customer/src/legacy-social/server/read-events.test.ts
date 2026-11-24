import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readEvents, SocialAutoError, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const json = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sentUrl = (send: typeof fetch): string => String(vi.mocked(send).mock.calls[0]?.[0]);

describe("readEvents", () => {
  it("asks for the events after a seq, with the page size capped at 100, and reads them", async () => {
    const send = json(200, { events: [{ seq: 5, id: "e1", type: "post.failed", createdAt: "2026-11-23T10:00:00Z", data: { externalId: "b1" } }], hasMore: true });
    expect(await readEvents(settings, 4, 500, send)).toEqual({ events: [{ id: "e1", type: "post.failed", seq: 5, createdAt: "2026-11-23T10:00:00Z", data: { externalId: "b1" } }], hasMore: true });
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/events?after=4&limit=100");
  });

  it("drops an entry it cannot read and answers an empty page for an odd body", async () => {
    expect((await readEvents(settings, 0, 10, json(200, { events: [{ nope: true }], hasMore: false }))).events).toEqual([]);
    expect(await readEvents(settings, 0, 10, json(200, "x"))).toEqual({ events: [], hasMore: false });
  });

  it("fails on a refusal", async () => {
    await expect(readEvents(settings, 0, 10, json(401, { error: "bad key" }))).rejects.toBeInstanceOf(SocialAutoError);
  });
});
