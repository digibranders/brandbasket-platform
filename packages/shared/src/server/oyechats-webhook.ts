import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/*
 * What OyeChats sends Fynix when a visitor leaves their details in a bot (OyeChats' webhook_service.py): a JSON body
 * { event, bot_id, timestamp, data } and a header `X-OyeChats-Signature: sha256=<hex>`, the HMAC-SHA256 of the exact body
 * bytes under the secret OyeChats made for that bot's webhook. Pure, so the route stays thin and both halves are tested.
 */

const SIGNATURE_PREFIX = "sha256=";
const HEX_DIGEST = /^[0-9a-f]+$/i;

/** True when `header` is `sha256=` and the HMAC-SHA256 of the exact raw `body` under `secret`. Compared in constant time. */
export function verifyOyeChatsSignature(body: string, header: string, secret: string): boolean {
  if (!header.startsWith(SIGNATURE_PREFIX)) return false;
  const given = header.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  const supplied = Buffer.from(given, "hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_COMPANY = 200;
const MAX_SESSION = 200;
const MAX_TIER = 40;
// C0 control characters and DEL: nothing a person typed into a chat box needs them, and they have no place in a lead's row.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

const botIdSchema = z.number().int().positive();

/** The bot a body names, before anything else is believed, so its secret can be found. Null when it names none. */
export function readOyeChatsBotId(body: string): number | null {
  const parsed = parseJsonObject(body);
  if (parsed === null) return null;
  const botId = botIdSchema.safeParse(parsed.bot_id);
  return botId.success ? botId.data : null;
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A detail as stored: trimmed, without control characters, clipped, or null when nothing is left. */
function detail(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, "").trim().slice(0, max);
  return cleaned === "" ? null : cleaned;
}

function occurredAt(value: unknown): Date {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

export type OyeChatsEvent =
  | {
      readonly kind: "lead";
      readonly botId: number;
      readonly sessionId: string;
      readonly name: string | null;
      readonly email: string | null;
      readonly phone: string | null;
      readonly company: string | null;
      readonly occurredAt: Date;
    }
  | {
      readonly kind: "qualification";
      readonly botId: number;
      readonly sessionId: string;
      readonly tier: string;
      readonly score: number | null;
    }
  /** An event Fynix does not use, or one it cannot read: acknowledged and dropped. */
  | { readonly kind: "ignored" };

const IGNORED: OyeChatsEvent = { kind: "ignored" };

/** Reads the events Fynix uses (`lead_captured`, `tier_transition`) and ignores the rest. Never throws. */
export function parseOyeChatsEvent(body: string): OyeChatsEvent {
  const envelope = parseJsonObject(body);
  if (envelope === null) return IGNORED;
  const botId = botIdSchema.safeParse(envelope.bot_id);
  if (!botId.success) return IGNORED;
  const data = envelope.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return IGNORED;
  const fields = data as Record<string, unknown>;
  const sessionId = detail(fields.session_id, MAX_SESSION);
  if (sessionId === null) return IGNORED;

  if (envelope.event === "lead_captured") {
    const name = detail(fields.name, MAX_NAME);
    const email = detail(fields.email, MAX_EMAIL);
    const phone = detail(fields.phone, MAX_PHONE);
    const company = detail(fields.company, MAX_COMPANY);
    if (name === null && email === null && phone === null && company === null) return IGNORED;
    return { kind: "lead", botId: botId.data, sessionId, name, email, phone, company, occurredAt: occurredAt(envelope.timestamp) };
  }

  if (envelope.event === "tier_transition") {
    const tier = detail(fields.new_tier, MAX_TIER);
    if (tier === null) return IGNORED;
    const score = z.number().int().min(0).max(100).safeParse(fields.score);
    return { kind: "qualification", botId: botId.data, sessionId, tier, score: score.success ? score.data : null };
  }

  return IGNORED;
}
