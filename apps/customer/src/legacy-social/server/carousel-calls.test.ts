import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decideCarousel, fetchCarouselSlide, loadCarousel, loadCarouselList, loadCarousels, makeCarousel, setCarouselWeekly, SocialAutoError, type SocialAutoSettings } from "./social-auto";

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
});
