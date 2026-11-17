import type { PushSubscriptionRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { createWebPushSender, inQuietHours, vapidFromEnv, type PushStore, type PushTransport } from "./web-push-sender";

const at = (iso: string): Date => new Date(iso);
// India time is UTC+5:30, so 21:00 IST is 15:30 UTC and 08:00 IST is 02:30 UTC.
const EVENING = at("2026-11-17T16:00:00Z");
const NOON = at("2026-11-17T06:30:00Z");

const row = (id: string, audience: "customer" | "staff" = "customer"): PushSubscriptionRow => ({
  id,
  audience,
  userId: "u1",
  endpoint: `https://push.example/${id}`,
  p256dh: "key",
  auth: "secret",
  userAgent: null,
  createdAt: NOON,
  lastSuccessAt: null,
  revokedAt: null,
});

function setup(rows: PushSubscriptionRow[], failures: Record<string, unknown> = {}, now: Date = NOON) {
  const delivered: string[] = [];
  const gone: string[] = [];
  const sent: { endpoint: string; payload: string }[] = [];
  const lookups: { audience: string; userId: string | null }[] = [];
  const store: PushStore = {
    live: async (audience, userId) => {
      lookups.push({ audience, userId });
      return rows.filter((entry) => entry.audience === audience);
    },
    delivered: async (id) => void delivered.push(id),
    gone: async (id) => void gone.push(id),
  };
  const transport: PushTransport = {
    send: async (subscription, payload) => {
      const failure = failures[subscription.endpoint];
      if (failure !== undefined) throw failure;
      sent.push({ endpoint: subscription.endpoint, payload });
    },
  };
  return { sender: createWebPushSender({ store, transport, now: () => now }), delivered, gone, sent, lookups };
}

const message = { title: "Payment failed", url: "https://app.example.test/billing", tag: "billing.payment_failed" };
const target = { audience: "customer", userId: "u1" } as const;

describe("quiet hours", () => {
  it.each([
    ["2026-11-17T15:29:00Z", false],
    ["2026-11-17T15:30:00Z", true],
    ["2026-11-18T02:29:00Z", true],
    ["2026-11-18T02:30:00Z", false],
  ])("at %s the answer is %s", (iso, quiet) => {
    expect(inQuietHours(at(iso))).toBe(quiet);
  });
});

describe("the web push sender", () => {
  it("sends the message to every live subscription of the customer and records each success", async () => {
    const { sender, sent, delivered, lookups } = setup([row("a"), row("b")]);
    await sender.send(target, { ...message, body: "Open Billing" });
    expect(lookups).toEqual([{ audience: "customer", userId: "u1" }]);
    expect(sent.map((entry) => entry.endpoint)).toEqual(["https://push.example/a", "https://push.example/b"]);
    expect(JSON.parse(sent[0]?.payload ?? "")).toEqual({ title: "Payment failed", body: "Open Billing", url: message.url, tag: message.tag });
    expect(delivered).toEqual(["a", "b"]);
  });

  it("sending to a target with no subscription is not an error", async () => {
    const { sender, sent } = setup([]);
    await expect(sender.send(target, message)).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it.each([404, 410])("revokes a subscription the push service answers %s for, and still sends to the rest", async (statusCode) => {
    const { sender, gone, delivered, sent } = setup([row("a"), row("b")], { "https://push.example/a": { statusCode } });
    await expect(sender.send(target, message)).resolves.toBeUndefined();
    expect(gone).toEqual(["a"]);
    expect(delivered).toEqual(["b"]);
    expect(sent).toHaveLength(1);
  });

  it("keeps a subscription on another error, sends to the rest, then throws so notify() reports it", async () => {
    const { sender, gone, delivered } = setup([row("a"), row("b")], { "https://push.example/a": { statusCode: 500 } });
    await expect(sender.send(target, message)).rejects.toThrow(/1 of 2/);
    expect(gone).toEqual([]);
    expect(delivered).toEqual(["b"]);
  });

  it("sends a staff push to every staff browser, at any hour", async () => {
    const { sender, sent, lookups } = setup([row("s1", "staff"), row("s2", "staff")], {}, EVENING);
    await sender.send({ audience: "staff", userId: null }, { ...message, event: "kickoff.ended" });
    expect(lookups).toEqual([{ audience: "staff", userId: null }]);
    expect(sent).toHaveLength(2);
  });

  it("holds a customer push back in quiet hours, except payment failed", async () => {
    const quiet = setup([row("a")], {}, EVENING);
    await quiet.sender.send(target, { ...message, tag: "website.live", event: "website.live" });
    expect(quiet.sent).toEqual([]);
    expect(quiet.lookups).toEqual([]);
    await quiet.sender.send(target, { ...message, event: "billing.payment_failed" });
    expect(quiet.sent).toHaveLength(1);
  });
});

describe("vapidFromEnv", () => {
  const keys = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:team@example.test" };

  it("reads the three values, trimmed", () => {
    expect(vapidFromEnv({ ...keys, VAPID_PUBLIC_KEY: " pub " })).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:team@example.test" });
  });

  it("is null when any is blank or missing, so the fake sender stays", () => {
    expect(vapidFromEnv({})).toBeNull();
    expect(vapidFromEnv({ ...keys, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(vapidFromEnv({ ...keys, VAPID_SUBJECT: undefined })).toBeNull();
  });
});
