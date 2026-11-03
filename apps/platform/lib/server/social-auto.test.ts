import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { connectLink, createPost, deletePost, ensureWorkspace, loadChannels, loadPosts, SocialAutoError, sendPostNow, socialAutoSettings, updatePost, uploadPicture, type SocialAutoSettings } from "./social-auto";

const SETTINGS: SocialAutoSettings = { baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function sender(response: Response): { send: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const send = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response.clone();
  }) as typeof fetch;
  return { send, calls };
}

describe("socialAutoSettings", () => {
  it("is off when nothing is set", () => {
    expect(socialAutoSettings({})).toBeNull();
    expect(socialAutoSettings({ SOCIAL_AUTO_URL: " ", SOCIAL_AUTO_KEY: "" })).toBeNull();
  });

  it("reads all three, and keeps the address's path (without a trailing slash, query or fragment)", () => {
    const env = { SOCIAL_AUTO_KEY: "key-1234567890abcdef", SOCIAL_AUTO_RETURN_URL: "https://app.example/social" };
    expect(socialAutoSettings({ ...env, SOCIAL_AUTO_URL: "https://social.example/" })).toEqual(SETTINGS);
    expect(socialAutoSettings({ ...env, SOCIAL_AUTO_URL: "https://social.example" })).toEqual(SETTINGS);
    expect(socialAutoSettings({ ...env, SOCIAL_AUTO_URL: "https://social.example/publisher/?x=1#y" })?.baseUrl).toBe("https://social.example/publisher");
  });

  it("refuses a half set up configuration instead of quietly switching the feature off", () => {
    expect(() => socialAutoSettings({ SOCIAL_AUTO_URL: "https://social.example" })).toThrow(/Invalid social-auto configuration/);
    expect(() => socialAutoSettings({ SOCIAL_AUTO_URL: "not a url", SOCIAL_AUTO_KEY: "key-1234567890abcdef", SOCIAL_AUTO_RETURN_URL: "https://app.example/social" })).toThrow(/SOCIAL_AUTO_URL/);
    expect(() => socialAutoSettings({ SOCIAL_AUTO_URL: "https://social.example", SOCIAL_AUTO_KEY: "short", SOCIAL_AUTO_RETURN_URL: "https://app.example/social" })).toThrow(/SOCIAL_AUTO_KEY/);
  });
});

describe("the calls", () => {
  it("makes the workspace with the business's id and name, and answers its channels", async () => {
    const { send, calls } = sender(json(201, { workspace: { id: "w", channels: [{ id: "facebook:1", platform: "facebook", account: "Acme", connectedAt: "2026-11-01T00:00:00Z" }] } }));
    const channels = await ensureWorkspace(SETTINGS, { id: "0192f3c4-0000-7000-8000-000000000001", name: "Acme Foods" }, send);
    expect(channels.map((c) => c.id)).toEqual(["facebook:1"]);
    expect(calls[0]?.url).toBe("https://social.example/api/v1/workspaces");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "0192f3c4-0000-7000-8000-000000000001", name: "Acme Foods" });
  });

  it("sends the key only as a bearer header, never follows a redirect, and does not cache", async () => {
    const { send, calls } = sender(json(200, { workspace: { channels: [] } }));
    await loadChannels(SETTINGS, "b1", send);
    const init = calls[0]?.init as RequestInit & { headers: Record<string, string> };
    expect(init.headers["Authorization"]).toBe("Bearer key-1234567890abcdef");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(calls[0]?.url).not.toContain("key-1234567890abcdef");
  });

  it("treats a business with no workspace yet as having no channels and no posts", async () => {
    expect(await loadChannels(SETTINGS, "b1", sender(json(404, { error: "no such workspace" })).send)).toEqual([]);
    expect(await loadPosts(SETTINGS, "b1", { from: "2026-10-05", to: "2027-01-31" }, sender(json(404, { error: "no such workspace" })).send)).toEqual([]);
  });

  it("asks for the posts of a window of days", async () => {
    const { send, calls } = sender(json(200, { posts: [{ id: "a", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: false, state: "scheduled", channels: [] }] }));
    const posts = await loadPosts(SETTINGS, "b 1", { from: "2026-10-05", to: "2027-01-31" }, send);
    expect(posts).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts?externalId=b+1&from=2026-10-05&to=2027-01-31");
  });

  it("asks for a connect link for one network, naming where to come back to", async () => {
    const { send, calls } = sender(json(200, { url: "https://dash.example/api/instagram-start?invite=abc", expiresInMinutes: 60 }));
    expect(await connectLink(SETTINGS, "b1", "instagram", send)).toBe("https://dash.example/api/instagram-start?invite=abc");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "b1", channel: "instagram", returnUrl: "https://app.example/social" });
  });

  it("refuses a connect link that is not a safe address", async () => {
    await expect(connectLink(SETTINGS, "b1", "linkedin", sender(json(200, { url: "http://evil.example/x" })).send)).rejects.toThrow(/not a safe address/);
  });

  it("says what was refused and the status, without the key", async () => {
    const error = await connectLink(SETTINGS, "b1", "facebook", sender(json(400, { error: "returnUrl is not one of the addresses registered for this product" })).send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialAutoError);
    expect((error as SocialAutoError).status).toBe(400);
    expect((error as SocialAutoError).message).toContain("returnUrl is not one of the addresses");
    expect((error as SocialAutoError).message).not.toContain("key-1234567890abcdef");
  });

  it("reports a service that cannot be reached", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(loadChannels(SETTINGS, "b1", down)).rejects.toThrow(/could not be reached: fetch failed/);
  });

  it("sends a picture as the raw JPG and answers its id", async () => {
    const { send, calls } = sender(json(201, { pictureId: "a".repeat(32) }));
    const picture = new Uint8Array([0xff, 0xd8, 0xff, 1, 2]);
    expect(await uploadPicture(SETTINGS, picture, send)).toBe("a".repeat(32));
    const init = calls[0]?.init as RequestInit & { headers: Record<string, string> };
    expect(calls[0]?.url).toBe("https://social.example/api/v1/pictures");
    expect(init.headers["Content-Type"]).toBe("image/jpeg");
    expect(init.headers["Authorization"]).toBe("Bearer key-1234567890abcdef");
    expect(new Uint8Array(init.body as Buffer)).toEqual(picture);
  });

  it("keeps what social-auto says about a refused picture for the customer, not the key", async () => {
    const error = await uploadPicture(SETTINGS, new Uint8Array([1]), sender(json(400, { error: "picture must be square" })).send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialAutoError);
    expect((error as SocialAutoError).detail).toBe("picture must be square");
    expect((error as SocialAutoError).message).not.toContain("key-1234567890abcdef");
  });

  it("makes a post for a day to the chosen channels, and reads it back", async () => {
    const created = { id: "manual-1", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: true, state: "scheduled", channels: [{ platform: "instagram", account: "acme", state: "scheduled", permalink: null }] };
    const { send, calls } = sender(json(201, { post: created }));
    const post = await createPost(SETTINGS, "business-1", { day: "2026-11-04", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, send);
    expect(post.id).toBe("manual-1");
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "business-1", day: "2026-11-04", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] });
  });

  it("gives the customer social-auto's words for a 4xx, and nothing for a fault on its side", async () => {
    const refused = await createPost(SETTINGS, "b", { day: "2026-11-01", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, sender(json(400, { error: "that day has already passed." })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("that day has already passed.");
    const broken = await createPost(SETTINGS, "b", { day: "2026-11-04", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, sender(json(500, { error: "could not schedule the post" })).send).catch((e: unknown) => e);
    expect((broken as SocialAutoError).detail).toBeNull();
  });

  it("refuses an answer that is not a post", async () => {
    await expect(createPost(SETTINGS, "b", { day: "2026-11-04", caption: "Hi", pictureId: "a".repeat(32), channels: [] }, sender(json(201, { post: { id: 1 } })).send)).rejects.toThrow(/could not be read/);
  });
});

describe("changing and removing a post", () => {
  const changed = { id: "manual-0123456789ab", date: "2026-11-06T10:00:00+05:30", caption: "New", manual: true, state: "scheduled", channels: [] };

  it("sends the changes for the business's own post, and leaves the picture out when it is not replaced", async () => {
    const { send, calls } = sender(json(200, { post: changed }));
    const post = await updatePost(SETTINGS, "business-1", "manual-0123456789ab", { day: "2026-11-06", caption: "New", channels: ["instagram:1"] }, send);
    expect(post.caption).toBe("New");
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts?externalId=business-1&postId=manual-0123456789ab");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ day: "2026-11-06", caption: "New", channels: ["instagram:1"] });
    const again = sender(json(200, { post: changed }));
    await updatePost(SETTINGS, "business-1", "manual-0123456789ab", { day: "2026-11-06", caption: "New", pictureId: "b".repeat(32), channels: ["instagram:1"] }, again.send);
    expect(JSON.parse(String(again.calls[0]?.init.body))).toMatchObject({ pictureId: "b".repeat(32) });
  });

  it("gives social-auto's words when it refuses, such as a post that has already gone out", async () => {
    const refused = await updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", caption: "x", channels: [] }, sender(json(409, { error: "this post is already due or sent, so it can no longer be changed" })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("this post is already due or sent, so it can no longer be changed");
    await expect(updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", caption: "x", channels: [] }, sender(json(200, { post: { id: 1 } })).send)).rejects.toThrow(/could not be read/);
  });

  it("removes a post with a DELETE for the business", async () => {
    const { send, calls } = sender(json(200, { ok: true }));
    await deletePost(SETTINGS, "business-1", "manual-0123456789ab", send);
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts?externalId=business-1&postId=manual-0123456789ab");
    expect(calls[0]?.init.method).toBe("DELETE");
    await expect(deletePost(SETTINGS, "b", "manual-0123456789ab", sender(json(404, { error: "no such post" })).send)).rejects.toMatchObject({ status: 404, detail: "no such post" });
  });
});

describe("sending a post now", () => {
  it("asks for the business's own post to go out, and reads whether every account took it", async () => {
    const { send, calls } = sender(json(200, { post: {}, failed: false, problems: [] }));
    expect(await sendPostNow(SETTINGS, "business-1", "manual-0123456789ab", send)).toEqual({ failed: false, accounts: [] });
    expect(calls[0]?.url).toBe("https://social.example/api/v1/send");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "business-1", postId: "manual-0123456789ab" });
  });

  it("names the accounts that refused it, once each", async () => {
    const answer = json(200, { failed: true, problems: [{ account: "Test Member", error: "x" }, { account: "Test Member", error: "y" }, { nope: 1 }] });
    expect(await sendPostNow(SETTINGS, "b", "manual-0123456789ab", sender(answer).send)).toEqual({ failed: true, accounts: ["Test Member"] });
  });

  it("gives social-auto's words when the post has already gone out", async () => {
    const refused = await sendPostNow(SETTINGS, "b", "manual-0123456789ab", sender(json(409, { error: "this post has already gone out" })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("this post has already gone out");
  });
});

describe("when social-auto is served under a path", () => {
  const BEHIND_PATH: SocialAutoSettings = { ...SETTINGS, baseUrl: "https://social.example/publisher" };

  it("sends every call under that path, keeping the query", async () => {
    const { send, calls } = sender(json(200, { workspace: { channels: [] }, posts: [], ok: true, failed: false, problems: [] }));
    await loadChannels(BEHIND_PATH, "business-1", send);
    await loadPosts(BEHIND_PATH, "business-1", { from: "2026-11-02", to: "2026-11-08" }, send);
    await deletePost(BEHIND_PATH, "business-1", "manual-0123456789ab", send);
    await sendPostNow(BEHIND_PATH, "business-1", "manual-0123456789ab", send);
    expect(calls.map((call) => call.url)).toEqual([
      "https://social.example/publisher/api/v1/workspaces?externalId=business-1",
      "https://social.example/publisher/api/v1/posts?externalId=business-1&from=2026-11-02&to=2026-11-08",
      "https://social.example/publisher/api/v1/posts?externalId=business-1&postId=manual-0123456789ab",
      "https://social.example/publisher/api/v1/send",
    ]);
  });
});
