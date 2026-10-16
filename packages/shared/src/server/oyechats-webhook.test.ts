import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseOyeChatsEvent, verifyOyeChatsSignature } from "./oyechats-webhook";

const SECRET = "0123456789abcdef0123456789abcdef";

function signed(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyOyeChatsSignature", () => {
  const body = JSON.stringify({ event: "lead_captured", bot_id: 41, timestamp: "2026-10-16T09:00:00+00:00", data: {} });

  it("accepts the HMAC-SHA256 of the exact body under the bot's secret", () => {
    expect(verifyOyeChatsSignature(body, signed(body), SECRET)).toBe(true);
  });

  it("refuses another secret, an altered body, a missing prefix, and anything that is not a hex digest", () => {
    expect(verifyOyeChatsSignature(body, signed(body, "another-secret-another-secret-00"), SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(`${body} `, signed(body), SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(body, signed(body).replace("sha256=", ""), SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(body, "sha256=not-hex", SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(body, "", SECRET)).toBe(false);
    expect(verifyOyeChatsSignature(body, `sha1=${signed(body).slice(7)}`, SECRET)).toBe(false);
  });

  it("refuses a digest of the wrong length without comparing it", () => {
    expect(verifyOyeChatsSignature(body, `sha256=${signed(body).slice(7, 20)}`, SECRET)).toBe(false);
  });
});

describe("parseOyeChatsEvent", () => {
  function envelope(event: string, data: unknown, botId: unknown = 41): string {
    return JSON.stringify({ event, bot_id: botId, timestamp: "2026-10-16T09:00:00+00:00", data });
  }

  it("reads a captured lead with its bot, session and details, trimmed", () => {
    const parsed = parseOyeChatsEvent(
      envelope("lead_captured", { session_id: "sess-1", name: "  Meera Shah ", email: "meera@example.com", phone: "+919820011223", company: "Shah Dental" }),
    );
    expect(parsed).toEqual({
      kind: "lead",
      botId: 41,
      sessionId: "sess-1",
      name: "Meera Shah",
      email: "meera@example.com",
      phone: "+919820011223",
      company: "Shah Dental",
      occurredAt: new Date("2026-10-16T09:00:00.000Z"),
    });
  });

  it("treats a missing, null or blank detail as none, and drops control characters", () => {
    const parsed = parseOyeChatsEvent(envelope("lead_captured", { session_id: "s", name: "A\u0000B\u0007", email: null, phone: "   " }));
    expect(parsed).toMatchObject({ kind: "lead", name: "AB", email: null, phone: null, company: null });
  });

  it("clips overlong details so one visitor cannot bloat a row", () => {
    const parsed = parseOyeChatsEvent(envelope("lead_captured", { session_id: "s", name: "x".repeat(5000), email: "y".repeat(5000) }));
    expect(parsed.kind).toBe("lead");
    if (parsed.kind === "lead") {
      expect(parsed.name?.length).toBe(200);
      expect(parsed.email?.length).toBe(254);
    }
  });

  it("ignores a lead that carries no detail at all, since there is nobody to follow up", () => {
    expect(parseOyeChatsEvent(envelope("lead_captured", { session_id: "s" }))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent(envelope("lead_captured", { session_id: "s", name: "  ", email: "" }))).toEqual({ kind: "ignored" });
  });

  it("reads a qualification change with its tier and score", () => {
    expect(parseOyeChatsEvent(envelope("tier_transition", { session_id: "sess-1", old_tier: "mql", new_tier: "sql", score: 82, behavioral_score: 10 }))).toEqual({
      kind: "qualification",
      botId: 41,
      sessionId: "sess-1",
      tier: "sql",
      score: 82,
    });
  });

  it("keeps the tier and drops a score outside 0 to 100 or not a whole number", () => {
    for (const score of [101, -1, 3.5, "high", null]) {
      expect(parseOyeChatsEvent(envelope("tier_transition", { session_id: "s", new_tier: "sal", score }))).toMatchObject({ kind: "qualification", tier: "sal", score: null });
    }
  });

  it("ignores events it does not use, and anything it cannot read", () => {
    expect(parseOyeChatsEvent(envelope("chat_closed", { session_id: "s" }))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent(envelope("lead_captured", { name: "No session" }))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent(envelope("lead_captured", { session_id: "s", name: "A" }, "41"))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent(envelope("lead_captured", { session_id: "s", name: "A" }, 0))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent(envelope("lead_captured", "text"))).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent("not json")).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent("[]")).toEqual({ kind: "ignored" });
    expect(parseOyeChatsEvent("")).toEqual({ kind: "ignored" });
  });

  it("falls back on the time of receipt when the timestamp is missing or unreadable", () => {
    const missing = JSON.stringify({ event: "lead_captured", bot_id: 41, data: { session_id: "s", name: "A" } });
    const before = Date.now();
    const parsed = parseOyeChatsEvent(missing);
    expect(parsed.kind).toBe("lead");
    if (parsed.kind === "lead") expect(parsed.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("names the bot of an event only to find its secret: readBotId reads it without trusting the rest", async () => {
    const { readOyeChatsBotId } = await import("./oyechats-webhook");
    expect(readOyeChatsBotId(envelope("anything", {}))).toBe(41);
    expect(readOyeChatsBotId("not json")).toBeNull();
    expect(readOyeChatsBotId(envelope("x", {}, "41"))).toBeNull();
    expect(readOyeChatsBotId(envelope("x", {}, 1.5))).toBeNull();
  });
});
