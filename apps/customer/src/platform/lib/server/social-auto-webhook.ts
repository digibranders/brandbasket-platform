import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SocialAutoEventInput } from "@brandbasket/db";
import type { NotificationEventKey } from "@brandbasket/shared/lib/notification-events";
import type { NotifyInput } from "@brandbasket/shared/server/notify";
import { z } from "zod";
import { bodyFingerprint } from "@/platform/lib/webhook-event";

/** social-auto signs `<t>.<raw body>`; a timestamp further than this from now is a replay or a bad clock. */
const TOLERANCE_SECONDS = 5 * 60;
const CATCH_UP_PAGE = 100;
const CATCH_UP_MAX_PAGES = 20;
const EVENT_TYPE = /^[A-Za-z0-9._:-]{1,64}$/;
const businessIdSchema = z.uuid();

export type SocialSignatureCheck = "ok" | "stale" | "invalid";

/** `X-Social-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, compared in constant time. */
export function checkSocialSignature(rawBody: string, header: string | null, secret: string, now: Date): SocialSignatureCheck {
  if (header === null) return "invalid";
  const parts = new Map(header.split(",").map((part) => {
    const at = part.indexOf("=");
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
  }));
  const t = parts.get("t") ?? "";
  const given = parts.get("v1") ?? "";
  if (!/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/i.test(given)) return "invalid";
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest();
  if (!timingSafeEqual(Buffer.from(given, "hex"), expected)) return "invalid";
  return Math.abs(now.getTime() / 1000 - Number(t)) > TOLERANCE_SECONDS ? "stale" : "ok";
}

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1),
  seq: z.number().int().nonnegative().nullish(),
  createdAt: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export interface SocialEvent {
  readonly id: string;
  readonly type: string;
  readonly seq: number | null;
  readonly createdAt: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export function parseSocialEvent(rawBody: string): SocialEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = eventSchema.safeParse(json);
  return parsed.success ? { id: parsed.data.id, type: parsed.data.type, seq: parsed.data.seq ?? null, createdAt: parsed.data.createdAt ?? "", data: parsed.data.data } : null;
}

/** One notice, typed per event so notify() checks its data. The provider's own text (error, account) is never copied onto a notice. */
type SendNotice = <K extends NotificationEventKey>(input: NotifyInput<K>) => Promise<void>;

export interface SocialAutoDeps {
  /** SOCIAL_AUTO_WEBHOOK_SECRET; null when unset. */
  readonly secret: string | null;
  readonly taken: (eventId: string) => Promise<boolean>;
  /** The business a workspace belongs to, or null when it is not one of ours. Throws when the lookup fails. */
  readonly resolveBusiness: (externalId: string) => Promise<string | null>;
  readonly notify: SendNotice;
  /** Throws when the row cannot be written (a repeat included). */
  readonly record: (input: SocialAutoEventInput) => Promise<void>;
}

export type SocialAutoResult =
  | { readonly kind: "handled"; readonly businessId: string }
  | { readonly kind: "ignored"; readonly businessId?: string | null }
  | { readonly kind: "duplicate" }
  | { readonly kind: "refused" }
  | { readonly kind: "unconfigured" };

/** The workspace id is the business id, or the business id, a colon and a key for a further brand. */
function businessIdOf(externalId: unknown): string | null {
  if (typeof externalId !== "string") return null;
  const id = businessIdSchema.safeParse(externalId.split(":")[0]);
  return id.success ? id.data : null;
}

/** Sends the notice an event stands for, or answers false for a type that has none. */
async function noticeFor(event: SocialEvent, businessId: string, notify: SendNotice): Promise<boolean> {
  const base = { audience: { kind: "customer", businessId } as const, dedupeKey: event.id };
  switch (event.type) {
    case "post.failed":
      await notify({ ...base, event: "social.post_failed", data: {} });
      return true;
    case "connection.expiring": {
      const daysLeft = z.number().int().min(0).max(366).safeParse(event.data.daysLeft);
      await notify({ ...base, event: "social.connection_expiring", data: { daysLeft: daysLeft.success ? daysLeft.data : 7 } });
      return true;
    }
    case "poster.ready":
      await notify({ ...base, event: "social.poster_ready", data: {} });
      return true;
    case "poster.auto_approved":
      await notify({ ...base, event: "social.poster_auto_approved", data: {} });
      return true;
    case "week.lapsed":
      await notify({ ...base, event: "social.week_lapsed", data: {} });
      return true;
    case "post.held":
      await notify({ ...base, event: "social.post_held", data: {} });
      return true;
    case "post.missed":
      await notify({ ...base, event: "social.post_missed", data: {} });
      return true;
    case "poster.expiring":
      await notify({ ...base, event: "social.poster_expiring", data: {} });
      return true;
    case "poster.expired":
      await notify({ ...base, event: "social.poster_expired", data: {} });
      return true;
    default:
      return false;
  }
}

/**
 * Acts on one event once: skips an id already taken, resolves the business, sends the notice (the event id is the dedupe key, so
 * a repeat that slips past the stored id still sends nothing twice), then stores the id. Shared by the webhook and the catch up.
 * A lookup that fails throws before anything is stored, so the delivery is retried; a store that fails is logged and the answer stands.
 */
export async function processSocialEvent(event: SocialEvent, rawBody: string, deps: SocialAutoDeps): Promise<SocialAutoResult> {
  if (await deps.taken(event.id)) return { kind: "duplicate" };
  const externalId = event.data.externalId;
  const parsedBusiness = businessIdOf(externalId);
  const businessId = parsedBusiness === null || typeof externalId !== "string" ? null : await deps.resolveBusiness(externalId);
  const sent = businessId === null ? false : await noticeFor(event, businessId, deps.notify);
  const result: SocialAutoResult = sent && businessId !== null ? { kind: "handled", businessId } : { kind: "ignored", businessId };
  try {
    await deps.record({ eventId: event.id, eventType: EVENT_TYPE.test(event.type) ? event.type : "unknown", result: sent ? "handled" : "ignored", businessId, ...bodyFingerprint(rawBody) });
  } catch (error) {
    console.error("[social-auto-webhook] an event could not be stored", { error: error instanceof Error ? error.name : "error" });
  }
  return result;
}

/** What social-auto's delivery came to. A signed body that is not an event is ignored, so social-auto stops retrying it. */
export async function handleSocialAutoWebhook(rawBody: string, signature: string | null, now: Date, deps: SocialAutoDeps): Promise<SocialAutoResult> {
  if (deps.secret === null) return { kind: "unconfigured" };
  if (checkSocialSignature(rawBody, signature, deps.secret, now) !== "ok") return { kind: "refused" };
  const event = parseSocialEvent(rawBody);
  if (event === null) return { kind: "ignored" };
  return processSocialEvent(event, rawBody, deps);
}

export interface CatchUpReport {
  readonly handled: number;
  readonly duplicates: number;
  readonly ignored: number;
  /** The highest seq read, or the cursor when nothing new came; remember it for the next call. */
  readonly lastSeq: number;
}

/** Reads one page of social-auto's event log after a seq (readEvents in legacy-social/server/social-auto.ts). */
export type ReadEvents = (after: number, limit: number) => Promise<{ readonly events: readonly SocialEvent[]; readonly hasMore: boolean }>;

/** Pulls the events missed while the webhook was down, oldest first, through the same path as a delivery. */
export async function catchUpSocialEvents(after: number, read: ReadEvents, deps: SocialAutoDeps, options: { readonly maxPages?: number } = {}): Promise<CatchUpReport> {
  const report = { handled: 0, duplicates: 0, ignored: 0, lastSeq: after };
  let cursor = after;
  for (let page = 0; page < (options.maxPages ?? CATCH_UP_MAX_PAGES); page += 1) {
    const { events, hasMore } = await read(cursor, CATCH_UP_PAGE);
    for (const event of events) {
      const result = await processSocialEvent(event, JSON.stringify(event), deps);
      if (result.kind === "handled") report.handled += 1;
      else if (result.kind === "duplicate") report.duplicates += 1;
      else report.ignored += 1;
      if (event.seq !== null) cursor = Math.max(cursor, event.seq);
    }
    report.lastSeq = cursor;
    if (!hasMore || events.length === 0) break;
  }
  return report;
}
