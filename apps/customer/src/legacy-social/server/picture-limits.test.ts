import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPictureLimits, SocialAutoError, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const respond = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("loadPictureLimits", () => {
  it("reads how many pictures each channel has left this week and when the count starts again", async () => {
    const send = respond(200, {
      week: { from: "2026-11-09", to: "2026-11-15", restart: "2026-11-16" },
      limit: 5,
      channels: [
        { network: "instagram", limit: 5, used: 2, left: 3 },
        { network: "linkedin", limit: 5, used: 5, left: 0 },
      ],
    });
    const limits = await loadPictureLimits(settings, "b1", send);
    expect(limits?.restart).toBe("2026-11-16");
    expect(limits?.channels).toEqual([
      { network: "instagram", limit: 5, used: 2, left: 3 },
      { network: "linkedin", limit: 5, used: 5, left: 0 },
    ]);
    expect(String(vi.mocked(send).mock.calls[0]?.[0])).toBe("http://127.0.0.1:4020/api/v1/limits?externalId=b1");
  });

  it("leaves out a network this page does not know, instead of failing", async () => {
    const send = respond(200, { week: { restart: "2026-11-16" }, channels: [{ network: "tiktok", limit: 5, used: 0, left: 5 }, { network: "google", limit: 5, used: 1, left: 4 }] });
    expect((await loadPictureLimits(settings, "b1", send))?.channels.map((channel) => channel.network)).toEqual(["google"]);
  });

  it("is null for a posting service that has no weekly limit yet, so the page shows nothing", async () => {
    expect(await loadPictureLimits(settings, "b1", respond(404))).toBeNull();
    expect(await loadPictureLimits(settings, "b1", respond(501))).toBeNull();
    // 503: the posting service could not find the ledger the count comes from; no number is better than a wrong one.
    expect(await loadPictureLimits(settings, "b1", respond(503))).toBeNull();
  });

  it("throws on any other refusal and on an answer it cannot read", async () => {
    await expect(loadPictureLimits(settings, "b1", respond(500))).rejects.toBeInstanceOf(SocialAutoError);
    await expect(loadPictureLimits(settings, "b1", respond(200, { week: {}, channels: "nope" }))).rejects.toBeInstanceOf(SocialAutoError);
  });
});
