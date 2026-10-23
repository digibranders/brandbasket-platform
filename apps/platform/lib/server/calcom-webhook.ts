import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { moveSetupCallBooking, removeSetupCallBooking } from "@brandbasket/db";
import { z } from "zod";
import { calcomBookingUri } from "./call-scheduling";
import { getStaffDb } from "./db";

/**
 * What a Cal.com delivery came to. `refused` is a missing or wrong signature; `unconfigured` is a server with no
 * CALCOM_WEBHOOK_SECRET, which cannot tell a real delivery from a forged one and so acts on none.
 */
export type CalcomWebhookResult =
  | { readonly kind: "moved" }
  | { readonly kind: "removed" }
  | { readonly kind: "ignored" }
  | { readonly kind: "refused" }
  | { readonly kind: "unconfigured" };

/** The kickoff-call change a delivery describes, or `other` for every event this app does not act on (Cal.com's ping included). */
export type CalcomEvent =
  | { readonly kind: "cancelled"; readonly uid: string }
  | { readonly kind: "rescheduled"; readonly fromUid: string; readonly uid: string; readonly startsAt: Date; readonly endsAt: Date }
  | { readonly kind: "other" };

const uid = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const deliverySchema = z.object({ triggerEvent: z.string(), payload: z.unknown() });
const cancelledSchema = z.object({ uid });
const rescheduledSchema = z.object({ uid, rescheduleUid: uid, startTime: z.string(), endTime: z.string() });

/**
 * Cal.com signs the exact body with HMAC-SHA256 under the webhook's secret and sends the hex digest in
 * `x-cal-signature-256`. Compared in constant time.
 */
export function verifyCalcomSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = /^[0-9a-f]+$/i.test(signature) ? Buffer.from(signature, "hex") : Buffer.alloc(0);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Reads a delivery's body. Anything this app does not act on, or does not recognise, is `other`. */
export function parseCalcomEvent(rawBody: string): CalcomEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { kind: "other" };
  }
  const delivery = deliverySchema.safeParse(json);
  if (!delivery.success) return { kind: "other" };
  if (delivery.data.triggerEvent === "BOOKING_CANCELLED") {
    const cancelled = cancelledSchema.safeParse(delivery.data.payload);
    return cancelled.success ? { kind: "cancelled", uid: cancelled.data.uid } : { kind: "other" };
  }
  if (delivery.data.triggerEvent === "BOOKING_RESCHEDULED") {
    const rescheduled = rescheduledSchema.safeParse(delivery.data.payload);
    if (!rescheduled.success) return { kind: "other" };
    const startsAt = new Date(rescheduled.data.startTime);
    const endsAt = new Date(rescheduled.data.endTime);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return { kind: "other" };
    return { kind: "rescheduled", fromUid: rescheduled.data.rescheduleUid, uid: rescheduled.data.uid, startsAt, endsAt };
  }
  return { kind: "other" };
}

/**
 * Handles one signed delivery from Cal.com (POST /api/webhooks/calcom), so a kickoff call the client cancelled or moved from
 * Cal.com's email shows the same on the dashboard. The booking is found by the Cal.com booking it was stored under, never
 * by anything else in the body, so a delivery about some other meeting on the same calendar changes nothing.
 *
 * Runs on the staff connection: the sender has no session (see the comment in lib/server/db.ts).
 */
export async function handleCalcomWebhook(rawBody: string, signature: string | null, now: Date): Promise<CalcomWebhookResult> {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();
  if (secret === undefined || secret === "") return { kind: "unconfigured" };
  if (signature === null || !verifyCalcomSignature(rawBody, signature, secret)) return { kind: "refused" };

  const event = parseCalcomEvent(rawBody);
  switch (event.kind) {
    case "cancelled":
      return (await removeSetupCallBooking(getStaffDb(), calcomBookingUri(event.uid))) ? { kind: "removed" } : { kind: "ignored" };
    case "rescheduled": {
      const moved = await moveSetupCallBooking(getStaffDb(), {
        fromInviteeUri: calcomBookingUri(event.fromUid),
        toInviteeUri: calcomBookingUri(event.uid),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        now,
      });
      return moved ? { kind: "moved" } : { kind: "ignored" };
    }
    case "other":
      return { kind: "ignored" };
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled Cal.com event: ${JSON.stringify(unhandled)}`);
    }
  }
}
