// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  catchUpSocialEvents,
  checkSocialSignature,
  handleSocialAutoWebhook,
  parseSocialEvent,
  type SocialAutoDeps,
  type SocialEvent,
} from "./social-auto-webhook";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(32);
const NOW = new Date("2026-11-23T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);
const BUSINESS = "0190a1b2-0000-7000-8000-000000000001";
const EVENT_ID = "0190a1b2-0000-7000-8000-0000000000aa";

const sign = (body: string, t: number = T, secret: string = SECRET): string => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const eventBody = (type: string, data: Record<string, unknown> = {}, id: string = EVENT_ID): string =>
  JSON.stringify({ id, type, seq: 7, createdAt: "2026-11-23T09:59:00Z", data: { externalId: BUSINESS, ...data } });

function deps(overrides: Partial<SocialAutoDeps> = {}): SocialAutoDeps & { notify: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> } {
  const notify = vi.fn(async () => undefined);
  const record = vi.fn(async () => undefined);
  return { secret: SECRET, taken: async () => false, resolveBusiness: async (externalId: string) => (externalId.split(":")[0] === BUSINESS ? BUSINESS : null), notify, record, ...overrides } as SocialAutoDeps & {
    notify: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

describe("checkSocialSignature", () => {
  const body = eventBody("post.failed");
  it("accepts a good signature", () => expect(checkSocialSignature(body, sign(body), SECRET, NOW)).toBe("ok"));
  it("refuses a wrong secret, a changed body, a missing or malformed header", () => {
    expect(checkSocialSignature(body, sign(body, T, "x".repeat(32)), SECRET, NOW)).toBe("invalid");
    expect(checkSocialSignature(`${body} `, sign(body), SECRET, NOW)).toBe("invalid");
    expect(checkSocialSignature(body, null, SECRET, NOW)).toBe("invalid");
    expect(checkSocialSignature(body, "garbage", SECRET, NOW)).toBe("invalid");
    expect(checkSocialSignature(body, `t=${T},v1=zz`, SECRET, NOW)).toBe("invalid");
  });
  it("refuses a timestamp more than five minutes away, either way", () => {
    expect(checkSocialSignature(body, sign(body, T - 301), SECRET, NOW)).toBe("stale");
    expect(checkSocialSignature(body, sign(body, T + 301), SECRET, NOW)).toBe("stale");
    expect(checkSocialSignature(body, sign(body, T - 299), SECRET, NOW)).toBe("ok");
  });
});

describe("parseSocialEvent", () => {
  it("reads an event, with or without a seq", () => {
    expect(parseSocialEvent(eventBody("post.failed"))?.seq).toBe(7);
    expect(parseSocialEvent(JSON.stringify({ id: EVENT_ID, type: "post.failed", createdAt: "x", data: {} }))?.seq).toBeNull();
  });
  it("answers null for anything that is not an event", () => {
    expect(parseSocialEvent("not json")).toBeNull();
    expect(parseSocialEvent(JSON.stringify({ type: "post.failed" }))).toBeNull();
    expect(parseSocialEvent(JSON.stringify({ id: "", type: "post.failed", data: {} }))).toBeNull();
  });
});

describe("handleSocialAutoWebhook", () => {
  it("answers unconfigured when no secret is set, and acts on nothing", async () => {
    const d = deps({ secret: null });
    const body = eventBody("post.failed");
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "unconfigured" });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("refuses a bad or stale signature without notifying or recording an event id", async () => {
    const d = deps();
    const body = eventBody("post.failed");
    expect(await handleSocialAutoWebhook(body, sign(body, T, "x".repeat(32)), NOW, d)).toEqual({ kind: "refused" });
    expect(await handleSocialAutoWebhook(body, sign(body, T - 400), NOW, d)).toEqual({ kind: "refused" });
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("does nothing for a repeat of an event id it already took", async () => {
    const d = deps({ taken: async () => true });
    const body = eventBody("post.failed");
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "duplicate" });
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("stores a signed body it cannot read as ignored, so social-auto stops retrying", async () => {
    const d = deps();
    const body = "{}";
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "ignored" });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("notifies once with the event id as the dedupe key and records it as handled", async () => {
    const d = deps();
    const body = eventBody("post.failed", { postId: "p1", channel: "instagram", account: "cafe", error: "boom" });
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "handled", businessId: BUSINESS });
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledWith({ event: "social.post_failed", audience: { kind: "customer", businessId: BUSINESS }, dedupeKey: EVENT_ID, data: {} });
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: EVENT_ID, eventType: "post.failed", result: "handled", businessId: BUSINESS }));
  });

  it("never puts the provider's error text on a notice", async () => {
    const d = deps();
    const body = eventBody("post.failed", { error: "token abc123 rejected" });
    await handleSocialAutoWebhook(body, sign(body), NOW, d);
    expect(JSON.stringify(d.notify.mock.calls)).not.toContain("abc123");
  });

  it.each([
    ["post.failed", {}, "social.post_failed", {}],
    ["connection.expiring", { daysLeft: 3 }, "social.connection_expiring", { daysLeft: 3 }],
    ["connection.expiring", { daysLeft: 0 }, "social.connection_expiring", { daysLeft: 0 }],
    ["poster.ready", {}, "social.poster_ready", {}],
    ["poster.auto_approved", {}, "social.poster_auto_approved", {}],
    ["week.lapsed", {}, "social.week_lapsed", {}],
    ["post.held", { code: "ACCOUNT_DISCONNECTED" }, "social.post_held", {}],
    ["post.missed", {}, "social.post_missed", {}],
    ["poster.expiring", {}, "social.poster_expiring", {}],
    ["poster.expired", {}, "social.poster_expired", {}],
  ] as const)("maps %s %o to %s", async (type, data, key, mapped) => {
    const d = deps();
    const body = eventBody(type, data);
    expect((await handleSocialAutoWebhook(body, sign(body), NOW, d)).kind).toBe("handled");
    expect(d.notify).toHaveBeenCalledWith({ event: key, audience: { kind: "customer", businessId: BUSINESS }, dedupeKey: EVENT_ID, data: mapped });
  });

  it.each(["post.published", "week.drawing", "week.drawn", "job.finished", "something.new"])("ignores %s: recorded, no notice", async (type) => {
    const d = deps();
    const body = eventBody(type);
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "ignored", businessId: BUSINESS });
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ result: "ignored", eventType: type.length <= 64 ? type : "unknown" }));
  });

  it("ignores an event whose workspace it cannot map, without an error", async () => {
    const d = deps();
    const body = JSON.stringify({ id: EVENT_ID, type: "post.failed", seq: 1, createdAt: "x", data: { externalId: "someone-else" } });
    expect(await handleSocialAutoWebhook(body, sign(body), NOW, d)).toEqual({ kind: "ignored", businessId: null });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("maps a further brand's id (business id, colon, key) to its business", async () => {
    const d = deps();
    const body = JSON.stringify({ id: EVENT_ID, type: "poster.ready", seq: 1, createdAt: "x", data: { externalId: `${BUSINESS}:abc123` } });
    expect((await handleSocialAutoWebhook(body, sign(body), NOW, d)).kind).toBe("handled");
    expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({ audience: { kind: "customer", businessId: BUSINESS } }));
  });

  it("still answers when the event cannot be recorded", async () => {
    const d = deps({ record: vi.fn(async () => Promise.reject(new Error("db down"))) });
    const body = eventBody("post.failed");
    expect((await handleSocialAutoWebhook(body, sign(body), NOW, d)).kind).toBe("handled");
  });

  it("lets a lookup failure through, so social-auto retries", async () => {
    const d = deps({ resolveBusiness: async () => Promise.reject(new Error("db down")) });
    const body = eventBody("post.failed");
    await expect(handleSocialAutoWebhook(body, sign(body), NOW, d)).rejects.toThrow("db down");
    expect(d.record).not.toHaveBeenCalled();
  });
});

describe("catchUpSocialEvents", () => {
  const event = (n: number): SocialEvent => ({ id: `0190a1b2-0000-7000-8000-${String(n).padStart(12, "0")}`, type: "post.failed", seq: n, createdAt: "x", data: { externalId: BUSINESS } });

  it("reads every page from the cursor, handles each event once and returns the highest seq", async () => {
    const d = deps({ taken: async (id: string) => id.endsWith("2") });
    const pages = [{ events: [event(1), event(2)], hasMore: true }, { events: [event(3)], hasMore: false }];
    const read = vi.fn(async () => pages.shift() ?? { events: [], hasMore: false });
    const report = await catchUpSocialEvents(0, read, d);
    expect(read).toHaveBeenNthCalledWith(1, 0, 100);
    expect(read).toHaveBeenNthCalledWith(2, 2, 100);
    expect(d.notify).toHaveBeenCalledTimes(2);
    expect(report).toEqual({ handled: 2, duplicates: 1, ignored: 0, lastSeq: 3 });
  });

  it("stops after a bounded number of pages so a runaway answer cannot loop", async () => {
    const d = deps();
    let n = 0;
    const read = vi.fn(async () => ({ events: [event(++n)], hasMore: true }));
    await catchUpSocialEvents(0, read, d, { maxPages: 3 });
    expect(read).toHaveBeenCalledTimes(3);
  });
});
