import "server-only";
import { createHmac } from "node:crypto";
import {
  listDueSalesRedemptions,
  markSalesRedemptionDelivered,
  markSalesRedemptionFailed,
  type SalesRedemption,
} from "@brandbasket/db";
import { getStaffDb } from "./db";

/**
 * Tells Fynix Sales about each paid coupon redemption (a payment made on a coupon assigned to one of its salespeople).
 * Rows are queued in the transaction that records the payment, so nothing here can tell Fynix about a payment that was not
 * captured. Fynix de-duplicates on `id`, so a retry after a lost answer is harmless.
 *
 * Environment: FYNIX_WEBHOOK_URL (where to post) and FYNIX_WEBHOOK_SECRET (at least 32 characters, shared with Fynix). Without
 * either, nothing is sent and the rows wait.
 */

const SECRET_MIN_LENGTH = 32;
const BATCH = 25;
const TIMEOUT_MS = 10_000;

export interface FynixWebhookConfig {
  readonly url: string;
  readonly secret: string;
}

export function fynixWebhookConfig(env: Readonly<Record<string, string | undefined>> = process.env): FynixWebhookConfig | null {
  const url = env.FYNIX_WEBHOOK_URL?.trim() ?? "";
  const secret = env.FYNIX_WEBHOOK_SECRET?.trim() ?? "";
  return url === "" || secret.length < SECRET_MIN_LENGTH ? null : { url, secret };
}

/** The message Fynix receives. Amounts are minor units of `currency` (paise for INR). */
export function redemptionPayload(redemption: SalesRedemption): Record<string, unknown> {
  return {
    id: redemption.eventId,
    type: "coupon.paid",
    couponCode: redemption.couponCode,
    client: { businessId: redemption.businessId, name: redemption.businessName, email: redemption.clientEmail },
    payment: {
      id: redemption.paymentId,
      kind: redemption.paymentKind,
      amountCents: redemption.amountCents,
      currency: redemption.currency,
      paidAt: redemption.paidAt.toISOString(),
    },
  };
}

/** HMAC-SHA256 over `<timestamp>.<raw body>`, hex, so a captured request cannot be replayed with another body or time. */
export function signBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export interface DeliverySummary {
  readonly configured: boolean;
  readonly delivered: number;
  readonly failed: number;
}

export async function deliverSalesRedemptions(now: Date, fetchImpl: typeof fetch = fetch): Promise<DeliverySummary> {
  const config = fynixWebhookConfig();
  if (config === null) return { configured: false, delivered: 0, failed: 0 };
  const db = getStaffDb();
  const due = await listDueSalesRedemptions(db, now, BATCH);
  let delivered = 0;
  let failed = 0;
  for (const redemption of due) {
    const body = JSON.stringify(redemptionPayload(redemption));
    const timestamp = String(Math.floor(now.getTime() / 1000));
    try {
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bb-timestamp": timestamp,
          "x-bb-signature": `sha256=${signBody(config.secret, timestamp, body)}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Fynix answered ${response.status}`);
      await markSalesRedemptionDelivered(db, redemption.eventId, new Date());
      delivered += 1;
    } catch (error) {
      await markSalesRedemptionFailed(db, redemption.eventId, error instanceof Error ? error.message : "send failed", redemption.attempts, new Date());
      failed += 1;
    }
  }
  return { configured: true, delivered, failed };
}
