import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewSiteHit } from "@brandbasket/db";
import { handleHit, handleHitPreflight, SITE_HIT_BUSINESS_RULE, SITE_HIT_VISITOR_RULE, type HitDeps } from "./site-hit-handler";

vi.mock("server-only", () => ({}));

const KEY = "bbk_abcdefghijklmnop";
const NOW = new Date("2026-10-05T10:00:00.000Z");
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let deps: { [K in keyof HitDeps]: ReturnType<typeof vi.fn> & HitDeps[K] };
let recorded: NewSiteHit[];

beforeEach(() => {
  recorded = [];
  deps = {
    now: vi.fn(() => NOW),
    findBusiness: vi.fn(async () => "biz-1"),
    hostnames: vi.fn(async () => ["saidental.in"]),
    hasAccess: vi.fn(async () => true),
    withinLimit: vi.fn(async () => true),
    salt: vi.fn(async () => "salt".repeat(16)),
    record: vi.fn(async (hit: NewSiteHit) => {
      recorded.push(hit);
    }),
  } as never;
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://app.localhost:3198/api/t", {
    method: "POST",
    body: text,
    headers: { "user-agent": CHROME, origin: "https://www.saidental.in", "x-forwarded-for": "203.0.113.7", "cf-ipcountry": "IN", "content-type": "text/plain", ...headers },
  });
}
const view = (extra: Record<string, unknown> = {}) => ({ key: KEY, kind: "pageview", path: "/about/", ...extra });

function expectQuietNoContent(response: Response): void {
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}
function expectNothingStored(): void {
  expect(deps.record).not.toHaveBeenCalled();
}

describe("POST /api/t", () => {
  it("records a page view with everything worked out on the server", async () => {
    const response = await handleHit(post(view({ ref: "https://www.google.com/search?q=dentist", campaign: "Diwali" })), deps);
    expectQuietNoContent(response);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      businessId: "biz-1",
      at: NOW,
      kind: "pageview",
      path: "/about",
      referrerHost: "google.com",
      channel: "search",
      utmCampaign: "diwali",
      device: "desktop",
      country: "IN",
      label: null,
      engagedMs: null,
      scrollPct: null,
    });
    expect(recorded[0]?.visitorHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("works out the device, the channel and an engagement report", async () => {
    await handleHit(post({ key: KEY, kind: "engagement", path: "/", engagedMs: 5000, scrollPct: 70, medium: "cpc" }, { "user-agent": PHONE }), deps);
    expect(recorded[0]).toMatchObject({ kind: "engagement", device: "mobile", channel: "paid", engagedMs: 5000, scrollPct: 70 });
  });

  it("treats a click from the business's own pages as direct", async () => {
    await handleHit(post(view({ ref: "https://saidental.in/services" })), deps);
    expect(recorded[0]?.channel).toBe("direct");
  });

  it("asks for the salt of the Indian day, so a visitor keeps one hash through it", async () => {
    deps.now.mockReturnValue(new Date("2026-10-05T19:00:00.000Z"));
    await handleHit(post(view()), deps);
    expect(deps.salt).toHaveBeenCalledWith("2026-10-06");
  });

  it("gives the same visitor the same hash, and another visitor or another day a different one", async () => {
    await handleHit(post(view()), deps);
    await handleHit(post(view()), deps);
    await handleHit(post(view(), { "x-forwarded-for": "203.0.113.8" }), deps);
    deps.salt.mockResolvedValue("other".repeat(16));
    await handleHit(post(view()), deps);
    const [first, again, otherVisitor, nextDay] = recorded.map((hit) => hit.visitorHash);
    expect(again).toBe(first);
    expect(otherVisitor).not.toBe(first);
    expect(nextDay).not.toBe(first);
  });

  it("stores nothing about the visitor beyond the hash", async () => {
    await handleHit(post(view()), deps);
    expect(JSON.stringify(recorded[0])).not.toContain("203.0.113.7");
    expect(JSON.stringify(recorded[0])).not.toContain("Mozilla");
  });

  it("drops a visitor who asked not to be tracked, before looking anything up", async () => {
    expectQuietNoContent(await handleHit(post(view(), { dnt: "1" }), deps));
    expectQuietNoContent(await handleHit(post(view(), { "sec-gpc": "1" }), deps));
    expect(deps.findBusiness).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("drops bots, and a request with no user agent, before looking anything up", async () => {
    expectQuietNoContent(await handleHit(post(view(), { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }), deps));
    expectQuietNoContent(await handleHit(post(view(), { "user-agent": "" }), deps));
    expect(deps.findBusiness).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("drops a body that is too big, not JSON, or has a field it does not know", async () => {
    for (const body of ["x".repeat(2000), "nope", JSON.stringify({ ...view(), email: "asha@example.com" }), JSON.stringify({ key: KEY, kind: "purchase", path: "/" })]) {
      expectQuietNoContent(await handleHit(post(body), deps));
    }
    expect(deps.findBusiness).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("drops an unknown key, saying nothing different from success", async () => {
    deps.findBusiness.mockResolvedValue(null);
    expectQuietNoContent(await handleHit(post(view()), deps));
    expect(deps.withinLimit).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("drops a hit from a page that is not the business's own, and accepts one with no origin", async () => {
    expectQuietNoContent(await handleHit(post(view(), { origin: "https://copycat.example" }), deps));
    expectNothingStored();
    const noOrigin = new Request("http://app.localhost:3198/api/t", { method: "POST", body: JSON.stringify(view()), headers: { "user-agent": CHROME } });
    await handleHit(noOrigin, deps);
    expect(recorded).toHaveLength(1);
  });

  it("drops a hit for a website whose plan has ended", async () => {
    deps.hasAccess.mockResolvedValue(false);
    expectQuietNoContent(await handleHit(post(view()), deps));
    expect(deps.hasAccess).toHaveBeenCalledWith("biz-1", NOW);
    expectNothingStored();
  });

  it("drops a hit over the business's limit before it spends a salt", async () => {
    deps.withinLimit.mockResolvedValueOnce(false);
    expectQuietNoContent(await handleHit(post(view()), deps));
    expect(deps.withinLimit).toHaveBeenCalledWith("site-hit:biz-1", SITE_HIT_BUSINESS_RULE);
    expect(deps.salt).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it("drops a hit over one visitor's limit", async () => {
    deps.withinLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expectQuietNoContent(await handleHit(post(view()), deps));
    const [visitorKey, rule] = deps.withinLimit.mock.calls[1] ?? [];
    expect(visitorKey).toMatch(/^site-hit-visitor:biz-1:[0-9a-f]{32}$/);
    expect(rule).toBe(SITE_HIT_VISITOR_RULE);
    expectNothingStored();
  });

  it("still answers 204 when something breaks, and logs without the request's details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deps.record.mockRejectedValue(new Error(`insert failed for params ${KEY}`));
    expectQuietNoContent(await handleHit(post(view()), deps));
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
    log.mockRestore();
  });
});

describe("OPTIONS /api/t", () => {
  it("answers a preflight for a JSON sender", () => {
    const response = handleHitPreflight();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  });
});
