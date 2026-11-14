import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { askTopic, decideCarousel, moveCarousel, fetchCarouselSlide, loadCarousel, loadCarouselList, loadAutoPosting, loadCarousels, loadSchedule, loadTopicRequests, makeCarousel, renameBrand, replaceTopic, saveAutoPosting, setCarouselWeekly, SocialAutoError, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const json = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sentBody = (send: typeof fetch): Record<string, unknown> => JSON.parse(String(vi.mocked(send).mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
const sentUrl = (send: typeof fetch): string => String(vi.mocked(send).mock.calls[0]?.[0]);

describe("the carousel calls", () => {
  it("lists the carousels, and a posting service with none yet has none", async () => {
    const send = json(200, { carousels: [{ id: "c1", count: 3, status: "pending" }] });
    expect((await loadCarousels(settings, "b1", send)).map((one) => one.id)).toEqual(["c1"]);
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/carousels?externalId=b1");
    expect(await loadCarousels(settings, "b1", json(404))).toEqual([]);
    expect(await loadCarousels(settings, "b1", json(501))).toEqual([]);
    await expect(loadCarousels(settings, "b1", json(500))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("reads whether the weekly carousel is on, and switches it", async () => {
    expect((await loadCarouselList(settings, "b1", json(200, { carousels: [], weekly: true }))).weekly).toBe(true);
    expect((await loadCarouselList(settings, "b1", json(200, { carousels: [] }))).weekly).toBe(false);
    expect(await loadCarouselList(settings, "b1", json(404))).toEqual({ carousels: [], weekly: false });
    const send = json(200, { weekly: true });
    expect(await setCarouselWeekly(settings, "b1", true, "actor-1", send)).toBe(true);
    const call = vi.mocked(send).mock.calls[0];
    expect(String(call?.[0])).toBe("http://127.0.0.1:4020/api/v1/carousels");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ externalId: "b1", action: "weekly", enabled: true });
    await expect(setCarouselWeekly(settings, "b1", false, "actor-1", json(500))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("moves a carousel to another day, and refuses when the posting service does", async () => {
    const send = json(200, { carousel: { id: "c1", date: "2026-11-21" } });
    await moveCarousel(settings, "b1", "c1", "2026-11-21", "actor-1", send);
    expect(sentBody(send)).toEqual({ externalId: "b1", action: "move", id: "c1", day: "2026-11-21" });
    await expect(moveCarousel(settings, "b1", "c1", "2026-11-21", "actor-1", json(409))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("reads one carousel by its id, and null when it is not there", async () => {
    const send = json(200, { carousel: { id: "c1", count: 3, status: "pending", slides: [{ position: 1, status: "pending" }] }, reasons: [] });
    expect((await loadCarousel(settings, "b1", "c1", send))?.id).toBe("c1");
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/carousels?externalId=b1&id=c1");
    expect(await loadCarousel(settings, "b1", "c1", json(404))).toBeNull();
  });

  it("asks for the carousel as the customer, and reads the job that makes it", async () => {
    const send = json(202, { job: { id: "j1", kind: "carousel", state: "queued", createdAt: "2026-11-12T10:00:00Z" }, created: true });
    const started = await makeCarousel(settings, "b1", { startDate: "2026-11-16" }, "brandbasket:u1", send);
    expect(started.job.kind).toBe("carousel");
    expect(sentBody(send)).toMatchObject({ externalId: "b1", action: "make", startDate: "2026-11-16" });
    expect(vi.mocked(send).mock.calls[0]?.[1]?.headers).toMatchObject({ "X-Social-Actor": "brandbasket:u1" });
  });

  it("keeps the posting service's own sentence and code when this week's carousel is already made", async () => {
    const send = json(429, { error: "You have made this week's carousel. You can make another from Monday 23 November.", code: "CAROUSEL_LIMIT_REACHED", restart: "2026-11-23" });
    const error = await makeCarousel(settings, "b1", {}, "brandbasket:u1", send).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SocialAutoError);
    expect((error as SocialAutoError).code).toBe("CAROUSEL_LIMIT_REACHED");
    expect((error as SocialAutoError).detail).toContain("Monday 23 November");
  });

  it("decides the whole carousel: approve, or reject with a reason", async () => {
    const approve = json(200, { carousel: { id: "c1", status: "approved" } });
    await decideCarousel(settings, "b1", { action: "approve", id: "c1" }, "brandbasket:u1", approve);
    expect(sentBody(approve)).toEqual({ externalId: "b1", action: "approve", id: "c1" });
    const reject = json(200, { carousel: { id: "c1", status: "rejected" } });
    await decideCarousel(settings, "b1", { action: "reject", id: "c1", reason: "weak_copy", comment: "Too plain" }, "brandbasket:u1", reject);
    expect(sentBody(reject)).toEqual({ externalId: "b1", action: "reject", id: "c1", reason: "weak_copy", comment: "Too plain" });
    await expect(decideCarousel(settings, "b1", { action: "approve", id: "c1" }, "brandbasket:u1", json(409, { error: "x", code: "ALREADY_DECIDED" }))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("fetches a slide as a picture, with the customer's own brand, and null when it is not there", async () => {
    const send = vi.fn(async () => new Response(new Uint8Array([255, 216, 255]), { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    expect(Array.from((await fetchCarouselSlide(settings, "b1", "c1", 2, send)) ?? [])).toEqual([255, 216, 255]);
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/carousels?externalId=b1&id=c1&slide=2&image=1");
    expect(await fetchCarouselSlide(settings, "b1", "c1", 2, vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch)).toBeNull();
    await expect(fetchCarouselSlide(settings, "b1", "c1", 2, vi.fn(async () => new Response("nope", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch)).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("reads the posting days, and tells a missing workspace (none yet) from a posting service that has no schedule (not offered)", async () => {
    const send = json(200, { schedule: { channels: { instagram: { days: ["mon", "tue", "sat"], nextWeek: [] } } } });
    expect(await loadSchedule(settings, "b1", send)).toEqual({ instagram: ["mon", "tue", "sat"] });
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/schedule?externalId=b1");
    expect(await loadSchedule(settings, "b1", json(404, { code: "WORKSPACE_NOT_FOUND", error: "no such workspace" }))).toEqual({});
    expect(await loadSchedule(settings, "b1", json(404))).toBeNull();
    expect(await loadSchedule(settings, "b1", json(501))).toBeNull();
    await expect(loadSchedule(settings, "b1", json(500))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("reads automatic posting from the workspace, with none yet for a business with no workspace and null for an older service", async () => {
    const send = json(200, { workspace: { channels: [{ id: "instagram:1", platform: "instagram", account: "acme" }], autoPosting: { channels: ["instagram"], safetyHours: 24, consentedAt: "2026-11-14T10:00:00Z", needsChoice: [] } } });
    expect((await loadAutoPosting(settings, "b1", send))?.channels).toEqual(["instagram"]);
    expect(sentUrl(send)).toBe("http://127.0.0.1:4020/api/v1/workspaces?externalId=b1");
    expect((await loadAutoPosting(settings, "b1", json(404)))?.channels).toEqual([]);
    expect(await loadAutoPosting(settings, "b1", json(200, { workspace: { channels: [] } }))).toBeNull();
    await expect(loadAutoPosting(settings, "b1", json(500))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("chooses the channels with a PATCH that carries her agreement and who agreed, and switches off without one", async () => {
    const send = json(200, { workspace: { channels: [{ id: "instagram:1", platform: "instagram", account: "acme" }], autoPosting: { channels: ["instagram"], safetyHours: 48, consentedAt: "2026-11-14T10:00:00Z", needsChoice: [] } } });
    await saveAutoPosting(settings, "b1", { channels: ["instagram"], safetyHours: 48 }, "brandbasket:u1", send);
    const call = vi.mocked(send).mock.calls[0];
    expect(call?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ externalId: "b1", autoPosting: { channels: ["instagram"], safetyHours: 48, consent: true } });
    expect((call?.[1]?.headers as Record<string, string>)["X-Social-Actor"]).toBe("brandbasket:u1");
    const off = json(200, { workspace: { channels: [], autoPosting: { channels: [], safetyHours: 24, consentedAt: null, needsChoice: [] } } });
    await saveAutoPosting(settings, "b1", { channels: [], safetyHours: 24 }, "brandbasket:u1", off);
    expect(JSON.parse(String(vi.mocked(off).mock.calls[0]?.[1]?.body))).toEqual({ externalId: "b1", autoPosting: { channels: [] } });
    const refused = await saveAutoPosting(settings, "b1", { channels: ["facebook"], safetyHours: 24 }, "a", json(400, { code: "CHANNEL_NOT_CONNECTED", error: "no" })).catch((error: unknown) => error);
    expect((refused as SocialAutoError).code).toBe("CHANNEL_NOT_CONNECTED");
  });

  it("renames a brand with a PATCH, and says so when the posting service refuses", async () => {
    const send = json(200, { workspace: { externalId: "b1", name: "Om Cafe" } });
    await renameBrand(settings, "b1", "Om Cafe", send);
    const call = vi.mocked(send).mock.calls[0];
    expect(String(call?.[0])).toBe("http://127.0.0.1:4020/api/v1/workspaces");
    expect(call?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ externalId: "b1", name: "Om Cafe" });
    await expect(renameBrand(settings, "b1", "Om Cafe", json(404, { error: "WORKSPACE_NOT_FOUND" }))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("asks for a new topic in place of a dropped post, as the posting service's replace action", async () => {
    const send = json(202, { job: { id: "job-1", kind: "replace", state: "queued", batchId: "b1", postId: "p1", createdAt: "2026-11-13T10:00:00Z" }, created: true });
    const started = await replaceTopic(settings, "biz-1", "b1", "p1", "actor-1", send);
    expect(started.job.kind).toBe("replace");
    expect(started.created).toBe(true);
    const call = vi.mocked(send).mock.calls[0];
    expect(String(call?.[0])).toBe("http://127.0.0.1:4020/api/v1/batches");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ externalId: "biz-1", batchId: "b1", action: "replace", postId: "p1" });
    await expect(replaceTopic(settings, "biz-1", "b1", "p1", "actor-1", json(429, { code: "REPLACE_LIMIT_REACHED", error: "limit" }))).rejects.toBeInstanceOf(SocialAutoError);
  });

  it("asks for a topic in her own words, and lists the ones she asked for", async () => {
    const sent = { id: "t-1", week: { from: "2026-11-16", to: "2026-11-22" }, goesOutOn: "2026-11-16", goesOutAt: "10:00", state: "writing", createdAt: "2026-11-13T10:00:00Z", picturesToDraw: 0 };
    const send = json(202, { request: sent });
    const asked = await askTopic(settings, "biz-1", "Diwali special: 20% off", "2026-11-16", "actor-1", send);
    expect(asked).toMatchObject({ id: "t-1", state: "writing", goesOutOn: "2026-11-16", batchId: null });
    const call = vi.mocked(send).mock.calls[0];
    expect(String(call?.[0])).toBe("http://127.0.0.1:4020/api/v1/topic-requests");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ externalId: "biz-1", text: "Diwali special: 20% off", week: "2026-11-16" });
    await expect(askTopic(settings, "biz-1", "x", undefined, "actor-1", json(429, { code: "TOPIC_LIMIT_REACHED", error: "one a week", restart: "2026-11-23" }))).rejects.toBeInstanceOf(SocialAutoError);
    const list = await loadTopicRequests(settings, "biz-1", json(200, { requests: [{ ...sent, state: "waiting_for_words", batchId: "own-1", postId: "o1", picturesToDraw: 2 }, { nonsense: true }] }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ state: "waiting_for_words", batchId: "own-1", postId: "o1", picturesToDraw: 2 });
    expect(await loadTopicRequests(settings, "biz-1", json(404))).toEqual([]);
  });
});
