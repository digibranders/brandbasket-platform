import { createHash } from "node:crypto";

/** Event names are short codes such as "subscription.charged"; anything else is stored as "unknown". */
const EVENT_NAME = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * The event's name as the provider wrote it in `field` (Razorpay and OyeChats "event", Cal.com "triggerEvent"). The body
 * may be unsigned, so only a plain code is kept; anything else is "unknown".
 */
export function webhookEventName(body: string, field: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return "unknown";
    const value = (parsed as Record<string, unknown>)[field];
    return typeof value === "string" && EVENT_NAME.test(value) ? value : "unknown";
  } catch {
    return "unknown";
  }
}

/** The body's SHA-256 (hex) and size, kept in place of the body itself. */
export function bodyFingerprint(body: string): { readonly bodySha256: string; readonly bodyBytes: number } {
  return { bodySha256: createHash("sha256").update(body, "utf8").digest("hex"), bodyBytes: Buffer.byteLength(body, "utf8") };
}

/** Why a handler failed, for the console: the error's kind only, as its message can carry the payload. */
export function failureReason(error: unknown): string {
  return error instanceof Error ? `Handler threw ${error.name}` : "Handler threw";
}
