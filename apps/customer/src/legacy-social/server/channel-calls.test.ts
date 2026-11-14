import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { connectLink, disconnectChannel, loadChannelPreview, SocialAutoError, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const json = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sentBody = (send: typeof fetch): Record<string, unknown> => JSON.parse(String(vi.mocked(send).mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
const sentUrl = (send: typeof fetch): string => String(vi.mocked(send).mock.calls[0]?.[0]);

describe("the channel calls", () => {
  it("reads what a disconnect would stop, with the days in order and only what it can read", async () => {
    const send = json(200, { scheduled: 6, days: ["2026-11-24T10:00:00+05:30", "2026-11-18"], approved: 6, running: ["draw", 7], onlyChannel: true });
    expect(await loadChannelPreview(settings, "b1", "instagram:1", send)).toEqual({ scheduled: 6, days: ["2026-11-18", "2026-11-24"], approved: 6, running: ["draw"], onlyChannel: true });
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/channels?externalId=b1&channelId=instagram%3A1");
  });

  it("has no preview when the posting service does not know the call, and fails on any other refusal", async () => {
    expect(await loadChannelPreview(settings, "b1", "instagram:1", json(404))).toBeNull();
    expect(await loadChannelPreview(settings, "b1", "instagram:1", json(501))).toBeNull();
    await expect(loadChannelPreview(settings, "b1", "instagram:1", json(500))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("disconnects a channel, saying so when it is her only one, and refuses on a conflict", async () => {
    const send = json(200, { workspace: {} });
    await disconnectChannel(settings, "b1", "instagram:1", false, "actor-1", send);
    expect(sentBody(send)).toEqual({ externalId: "b1", action: "disconnect", channelId: "instagram:1" });
    const only = json(200, { workspace: {} });
    await disconnectChannel(settings, "b1", "instagram:1", true, "actor-1", only);
    expect(sentBody(only)).toEqual({ externalId: "b1", action: "disconnect", channelId: "instagram:1", confirmOnly: true });
    await expect(disconnectChannel(settings, "b1", "instagram:1", false, "actor-1", json(409, { error: "wait until it finishes", code: "CONFLICT" }))).rejects.toBeInstanceOf(SocialAutoError);
  });
});

describe("the settings", () => {
  const env = { SOCIAL_AUTO_URL: "https://social.example.com/publisher/", SOCIAL_AUTO_KEY: "k".repeat(20), SOCIAL_AUTO_RETURN_URL: "https://app.example.com/social" };

  it("keeps the address of the pictures apart from the API's only when one is given", async () => {
    const { socialAutoSettings } = await import("./social-auto");
    expect(socialAutoSettings(env)?.pictureUrl).toBeUndefined();
    expect(socialAutoSettings({ ...env, SOCIAL_AUTO_PICTURE_URL: "http://127.0.0.1:4025/" })?.pictureUrl).toBe("http://127.0.0.1:4025");
    expect(() => socialAutoSettings({ ...env, SOCIAL_AUTO_PICTURE_URL: "not a url" })).toThrow(/SOCIAL_AUTO_PICTURE_URL/);
  });

  it("asks for a connect link, and names the brand an account is moved from only when it is given", async () => {
    const answer = { url: "https://allow.example.com/go" };
    const plain = json(200, answer);
    await connectLink(settings, "b2", "instagram", plain);
    expect(sentBody(plain)).toEqual({ externalId: "b2", channel: "instagram", returnUrl: "https://app.example.com/social" });
    const moving = json(200, answer);
    await connectLink(settings, "b2", "instagram", moving, "b1");
    expect(sentBody(moving)).toEqual({ externalId: "b2", channel: "instagram", returnUrl: "https://app.example.com/social", moveFrom: "b1" });
  });
});
