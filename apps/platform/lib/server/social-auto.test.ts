import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { actorOf, connectLink, createPost, decideBatch, decideFact, decidePoster, drawBatch, addNetwork, archiveBrand, createBrand, fetchPosterImage, loadBrands, loadBatches, loadTopics, loadFacts, loadPosters, loadSiteJobs, startSiteJob, deletePost, ensureWorkspace, loadChannels, loadPosts, SocialAutoError, movePost, sendPostNow, socialAutoSettings, updatePost, uploadPicture, type SocialAutoSettings } from "./social-auto";

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
    const post = await createPost(SETTINGS, "business-1", { day: "2026-11-04", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, send);
    expect(post.id).toBe("manual-1");
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "business-1", day: "2026-11-04", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] });
  });

  it("gives the customer social-auto's words for a 4xx, and nothing for a fault on its side", async () => {
    const refused = await createPost(SETTINGS, "b", { day: "2026-11-01", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, sender(json(400, { error: "that day has already passed." })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("that day has already passed.");
    const broken = await createPost(SETTINGS, "b", { day: "2026-11-04", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: ["instagram:1"] }, sender(json(500, { error: "could not schedule the post" })).send).catch((e: unknown) => e);
    expect((broken as SocialAutoError).detail).toBeNull();
  });

  it("refuses an answer that is not a post", async () => {
    await expect(createPost(SETTINGS, "b", { day: "2026-11-04", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: [] }, sender(json(201, { post: { id: 1 } })).send)).rejects.toThrow(/could not be read/);
  });
});

describe("changing and removing a post", () => {
  const changed = { id: "manual-0123456789ab", date: "2026-11-06T10:00:00+05:30", caption: "New", manual: true, state: "scheduled", channels: [] };

  it("sends the changes for the business's own post, and leaves the picture out when it is not replaced", async () => {
    const { send, calls } = sender(json(200, { post: changed }));
    const post = await updatePost(SETTINGS, "business-1", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "New", channels: ["instagram:1"] }, send);
    expect(post.caption).toBe("New");
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posts?externalId=business-1&postId=manual-0123456789ab");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ day: "2026-11-06", time: "10:00", caption: "New", channels: ["instagram:1"] });
    const again = sender(json(200, { post: changed }));
    await updatePost(SETTINGS, "business-1", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "New", pictureId: "b".repeat(32), channels: ["instagram:1"] }, again.send);
    expect(JSON.parse(String(again.calls[0]?.init.body))).toMatchObject({ pictureId: "b".repeat(32) });
  });

  it("gives social-auto's words when it refuses, such as a post that has already gone out", async () => {
    const refused = await updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "x", channels: [] }, sender(json(409, { error: "this post is already due or sent, so it can no longer be changed" })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("this post is already due or sent, so it can no longer be changed");
    await expect(updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "x", channels: [] }, sender(json(200, { post: { id: 1 } })).send)).rejects.toThrow(/could not be read/);
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

describe("moving a post", () => {
  it("sends only the new day and time", async () => {
    const moved = { id: "manual-0123456789ab", date: "2026-11-12T11:15:00+05:30", caption: "Hi", manual: true, state: "scheduled", channels: [] };
    const { send, calls } = sender(json(200, { post: moved }));
    const post = await movePost(SETTINGS, "business-1", "manual-0123456789ab", { day: "2026-11-12", time: "11:15" }, send);
    expect(post.date).toBe("2026-11-12T11:15:00+05:30");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ day: "2026-11-12", time: "11:15" });
  });

  it("gives social-auto's words when it refuses", async () => {
    const refused = await movePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-01", time: "10:00" }, sender(json(400, { error: "that time has already passed. Choose a later time." })).send).catch((e: unknown) => e);
    expect((refused as SocialAutoError).detail).toBe("that time has already passed. Choose a later time.");
  });
});

describe("captions of their own for single networks", () => {
  it("sends them with a new post, only for the networks that have one", async () => {
    const { send, calls } = sender(json(201, { post: { id: "manual-0123456789ab", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: true, state: "scheduled", channels: [], variants: { linkedin: { caption: "Long" } } } }));
    const post = await createPost(SETTINGS, "b", { day: "2026-11-04", time: "10:00", caption: "Hi", pictureId: "a".repeat(32), channels: ["linkedin:1"], variants: { linkedin: "Long" } }, send);
    expect(JSON.parse(String(calls[0]?.init.body)).variants).toEqual({ linkedin: { caption: "Long" } });
    expect(post.variants?.linkedin?.caption).toBe("Long");
  });

  it("sends nothing about them when there are none, and null for a network put back on the main caption", async () => {
    const answer = json(200, { post: { id: "manual-0123456789ab", date: "2026-11-04T10:00:00+05:30", caption: "Hi", manual: true, state: "scheduled", channels: [] } });
    const first = sender(answer);
    await updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "New", channels: ["instagram:1"] }, first.send);
    expect("variants" in JSON.parse(String(first.calls[0]?.init.body))).toBe(false);
    const second = sender(answer);
    await updatePost(SETTINGS, "b", "manual-0123456789ab", { day: "2026-11-06", time: "10:00", caption: "New", channels: ["instagram:1"], variants: { linkedin: "Longer", instagram: null } }, second.send);
    expect(JSON.parse(String(second.calls[0]?.init.body)).variants).toEqual({ linkedin: { caption: "Longer" }, instagram: null });
  });
});


describe("the AI side", () => {
  const job = { id: "job_1", kind: "write", state: "queued", createdAt: "2026-11-11T10:00:00Z" };

  it("builds the person who decides from the session, within the length social-auto accepts", () => {
    expect(actorOf({ businessId: "b", userId: "user-1" })).toBe("brandbasket:user-1");
    expect(actorOf({ businessId: "b", userId: "u".repeat(100) })).toHaveLength(64);
  });

  it("starts a website job with the person who asked, and only the networks that were named", async () => {
    const { send, calls } = sender(json(202, { job, created: true }));
    const started = await startSiteJob(SETTINGS, "business-1", { site: "omsweets.in", page: false, networks: ["instagram", "linkedin"] }, "brandbasket:user-1", send);
    expect(started).toEqual({ job, created: true });
    expect(calls[0]?.url).toBe("https://social.example/api/v1/site-jobs");
    expect((calls[0]?.init.headers as Record<string, string>)["X-Social-Actor"]).toBe("brandbasket:user-1");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "business-1", site: "omsweets.in", networks: ["instagram", "linkedin"] });
    const one = sender(json(200, { job, created: false }));
    await startSiteJob(SETTINGS, "business-1", { site: "https://omsweets.in/diwali", page: true }, "brandbasket:user-1", one.send);
    expect(JSON.parse(String(one.calls[0]?.init.body))).toEqual({ externalId: "business-1", site: "https://omsweets.in/diwali", page: true });
  });

  it("keeps the error's code, so the page can use its own words", async () => {
    const refused = await startSiteJob(SETTINGS, "b", { site: "x.in", page: false }, "brandbasket:u", sender(json(429, { error: "limit", code: "JOB_LIMIT_REACHED" })).send).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SocialAutoError);
    expect(refused).toMatchObject({ status: 429, code: "JOB_LIMIT_REACHED", detail: "limit" });
    const old = await startSiteJob(SETTINGS, "b", { site: "x.in", page: false }, "brandbasket:u", sender(json(400, { error: "no code here" })).send).catch((e: unknown) => e);
    expect(old).toMatchObject({ code: null });
    await expect(startSiteJob(SETTINGS, "b", { site: "x.in", page: false }, "brandbasket:u", sender(json(202, { job: { id: 1 } })).send)).rejects.toThrow(/could not be read/);
  });

  it("lists the jobs, reading a missing customer as none yet", async () => {
    expect(await loadSiteJobs(SETTINGS, "b", sender(json(200, { jobs: [job] })).send)).toHaveLength(1);
    expect(await loadSiteJobs(SETTINGS, "b", sender(json(404, { error: "no", code: "WORKSPACE_NOT_FOUND" })).send)).toEqual([]);
    await expect(loadSiteJobs(SETTINGS, "b", sender(json(503, { error: "down", code: "ENGINE_UNAVAILABLE" })).send)).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("reads the facts, and null before the website was read, and decides one with the actor", async () => {
    expect(await loadFacts(SETTINGS, "b", sender(json(404, { error: "not yet", code: "NOT_FOUND" })).send)).toBeNull();
    const facts = { builtAt: "2026-11-11T10:00:00Z", facts: [{ id: "f1", text: "Free delivery", state: "confirmed", held: false }] };
    const { send, calls } = sender(json(200, facts));
    const decided = await decideFact(SETTINGS, "business-1", "f1", "remove", "brandbasket:u", send);
    expect(decided.facts[0]?.id).toBe("f1");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ externalId: "business-1", factId: "f1", action: "remove" });
    const held = await decideFact(SETTINGS, "b", "f1", "confirm", "brandbasket:u", sender(json(409, { error: "held", code: "FACT_HELD" })).send).catch((e: unknown) => e);
    expect(held).toMatchObject({ status: 409, code: "FACT_HELD" });
  });

  it("changes a written post and asks for the pictures", async () => {
    const batch = { id: "week-05", createdAt: "2026-11-11T10:00:00Z", networks: ["instagram"], posts: [{ id: "p1", headline: "H", caption: "C", state: "kept" }] };
    const first = sender(json(200, { batch }));
    const kept = await decideBatch(SETTINGS, "business-1", "week-05", { action: "keep", postId: "p1" }, "brandbasket:u", first.send);
    expect(kept.posts[0]?.state).toBe("kept");
    expect(JSON.parse(String(first.calls[0]?.init.body))).toEqual({ externalId: "business-1", batchId: "week-05", action: "keep", postId: "p1" });
    const edit = sender(json(200, { batch }));
    await decideBatch(SETTINGS, "business-1", "week-05", { action: "edit", postId: "p1", network: "linkedin", caption: "New words" }, "brandbasket:u", edit.send);
    expect(JSON.parse(String(edit.calls[0]?.init.body))).toMatchObject({ action: "edit", network: "linkedin", caption: "New words" });
    const drawn = sender(json(202, { job: { ...job, kind: "draw" }, created: true }));
    expect((await drawBatch(SETTINGS, "business-1", "week-05", "brandbasket:u", drawn.send)).job.kind).toBe("draw");
    expect(JSON.parse(String(drawn.calls[0]?.init.body))).toEqual({ externalId: "business-1", batchId: "week-05", action: "draw" });
    expect((await loadBatches(SETTINGS, "b", sender(json(200, { batches: [batch], expired: [{ id: "week-00.json", expiredAt: "2026-11-19T09:00:00.000Z" }] })).send)).batches).toHaveLength(1);
    expect((await loadBatches(SETTINGS, "b", sender(json(200, { batches: [batch], expired: [{ id: "week-00.json", expiredAt: "2026-11-19T09:00:00.000Z" }] })).send)).expired).toEqual([{ id: "week-00.json", expiredAt: "2026-11-19T09:00:00.000Z" }]);
    const locked = await decideBatch(SETTINGS, "b", "week-05", { action: "drop", postId: "p1" }, "brandbasket:u", sender(json(409, { error: "final", code: "BATCH_LOCKED" })).send).catch((e: unknown) => e);
    expect(locked).toMatchObject({ code: "BATCH_LOCKED" });
  });

  it("lists the pictures and takes the customer's decision, including one more picture", async () => {
    const poster = { id: "v1", batchId: "week-05", postId: "p1", network: "instagram", shape: "square", width: 1024, height: 1024, headline: "H", caption: "C", versionNumber: 1, status: "pending", canRedraw: true, redrawsLeft: 1, createdAt: "2026-11-11T10:00:00Z" };
    const listed = sender(json(200, { posters: [poster], reasons: ["weak_copy"] }));
    expect((await loadPosters(SETTINGS, "business-1", "open", listed.send)).posters).toHaveLength(1);
    expect(listed.calls[0]?.url).toContain("status=open");
    const approve = sender(json(200, { decision: { id: "v1", status: "approved", decidedAt: "x" } }));
    expect((await decidePoster(SETTINGS, "business-1", { action: "approve", id: "v1" }, "brandbasket:u", approve.send)).job).toBeNull();
    expect(JSON.parse(String(approve.calls[0]?.init.body))).toEqual({ externalId: "business-1", action: "approve", id: "v1" });
    const reject = sender(json(200, { decision: { id: "v1", status: "rejected", decidedAt: "x" } }));
    await decidePoster(SETTINGS, "business-1", { action: "reject", id: "v1", reason: "weak_copy" }, "brandbasket:u", reject.send);
    expect(JSON.parse(String(reject.calls[0]?.init.body))).toMatchObject({ action: "reject", reason: "weak_copy" });
    const redraw = sender(json(202, { job: { ...job, kind: "draw" }, created: true }));
    expect((await decidePoster(SETTINGS, "business-1", { action: "redraw", id: "v1" }, "brandbasket:u", redraw.send)).job?.kind).toBe("draw");
    const topic = sender(json(200, { decisions: [] }));
    await decidePoster(SETTINGS, "business-1", { action: "approve-topic", batchId: "week-05", postId: "p1" }, "brandbasket:u", topic.send);
    expect(JSON.parse(String(topic.calls[0]?.init.body))).toMatchObject({ action: "approve-topic", batchId: "week-05", postId: "p1" });
    const blocked = await decidePoster(SETTINGS, "b", { action: "approve", id: "v1" }, "brandbasket:u", sender(json(409, { error: "blocked", code: "POSTER_BLOCKED" })).send).catch((e: unknown) => e);
    expect(blocked).toMatchObject({ status: 409, code: "POSTER_BLOCKED" });
  });
});

describe("fetchPosterImage", () => {
  const jpeg = (status: number): Response => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status, headers: { "content-type": "image/jpeg" } });

  it("asks for the picture of this customer with the product key, and answers its bytes", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const send = (async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jpeg(200);
    }) as typeof fetch;
    const bytes = await fetchPosterImage(SETTINGS, "business-1", "v1", send);
    expect(bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(calls[0]?.url).toBe("https://social.example/api/v1/posters?externalId=business-1&id=v1&image=1");
    expect((calls[0]?.init.headers as Record<string, string>)["Authorization"]).toBe("Bearer key-1234567890abcdef");
  });

  it("answers null for a picture that is not there, and refuses an answer that is not a picture", async () => {
    expect(await fetchPosterImage(SETTINGS, "b", "v1", (async () => jpeg(404)) as typeof fetch)).toBeNull();
    await expect(fetchPosterImage(SETTINGS, "b", "v1", (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch)).rejects.toBeInstanceOf(SocialAutoError);
    await expect(fetchPosterImage(SETTINGS, "b", "v1", (async () => { throw new Error("down"); }) as typeof fetch)).rejects.toThrow(/could not be reached/);
  });
});

describe("topics and adding a network", () => {
  it("reads each topic with the networks it lacks, and keeps what is readable", async () => {
    const body = { topics: [{ batchId: "week-01.json", postId: "w01-d1", headline: "H", networks: [{ network: "instagram", status: "approved" }], missing: ["facebook"] }, { nope: true }], connected: ["instagram", "facebook"] };
    const topics = await loadTopics(SETTINGS, "b", sender(json(200, body)).send);
    expect(topics).toHaveLength(1);
    expect(topics[0]?.missing).toEqual(["facebook"]);
    expect(await loadTopics(SETTINGS, "b", sender(json(404, { error: "none", code: "WORKSPACE_NOT_FOUND" })).send)).toEqual([]);
  });

  it("asks for the network with the actor, follows the job it answers, and shows the service's code when refused", async () => {
    const answer = sender(json(202, { job: { id: "j1", kind: "network", batchId: "week-01.json", state: "queued", createdAt: "x" }, created: true }));
    const job = await addNetwork(SETTINGS, "business-1", "week-01.json", "facebook", "brandbasket:u", answer.send);
    expect(job).toMatchObject({ id: "j1", kind: "network" });
    expect(JSON.parse(String(answer.calls[0]?.init.body))).toEqual({ externalId: "business-1", batchId: "week-01.json", action: "add-network", network: "facebook" });
    const refused = await addNetwork(SETTINGS, "b", "week-01.json", "facebook", "brandbasket:u", sender(json(409, { error: "there", code: "NETWORK_ALREADY_THERE" })).send).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: "NETWORK_ALREADY_THERE" });
  });
});

describe("brands", () => {
  it("reads the business's brands by its group, and is null for a service that does not know them", async () => {
    const answer = sender(json(200, { workspaces: [{ externalId: "b", name: "One" }], brandsAllowed: 2, brandsUsed: 1 }));
    expect(await loadBrands(SETTINGS, "b", "Fallback", answer.send)).toMatchObject({ allowed: 2, used: 1 });
    expect(answer.calls[0]?.url).toContain("/api/v1/workspaces?group=b");
    expect(await loadBrands(SETTINGS, "b", "x", sender(json(400, { error: "externalId is required" })).send)).toBeNull();
    expect(await loadBrands(SETTINGS, "b", "x", sender(json(404, { error: "none" })).send)).toBeNull();
    await expect(loadBrands(SETTINGS, "b", "x", sender(json(500, { error: "x" })).send)).rejects.toMatchObject({ status: 500 });
  });

  it("makes a further brand in the business's group, and passes on the service's code when it refuses", async () => {
    const made = sender(json(201, { workspace: { id: "x" } }));
    await createBrand(SETTINGS, "b", "abc12345", "Om Snacks", made.send);
    expect(JSON.parse(String(made.calls[0]?.init.body))).toEqual({ externalId: "b:abc12345", name: "Om Snacks", group: "b" });
    const refused = await createBrand(SETTINGS, "b", "k", "N", sender(json(409, { error: "limit", code: "BRAND_LIMIT_REACHED" })).send).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: "BRAND_LIMIT_REACHED" });
  });

  it("archives and brings back a brand", async () => {
    const answer = sender(json(200, { ok: true }));
    await archiveBrand(SETTINGS, "b:k", true, answer.send);
    expect(answer.calls[0]?.url).toContain("/api/v1/workspaces/archive");
    expect(JSON.parse(String(answer.calls[0]?.init.body))).toEqual({ externalId: "b:k", archived: true });
    await expect(archiveBrand(SETTINGS, "b:k", false, sender(json(409, { error: "x", code: "BRAND_LIMIT_REACHED" })).send)).rejects.toMatchObject({ code: "BRAND_LIMIT_REACHED" });
  });
});
