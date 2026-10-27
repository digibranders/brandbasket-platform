import type { SourceHealth } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { DELIVERY_ORDER, deliveryLine } from "./system-health-lines";

// 15:28 on Monday 30 November 2026 in India.
const NOW = new Date("2026-11-30T09:58:00.000Z");
const EARLY = new Date("2026-11-30T03:28:00.000Z"); // 08:58 in India
const LATER = new Date("2026-11-30T04:28:00.000Z"); // 09:58 in India
const YESTERDAY = new Date("2026-11-29T12:00:00.000Z"); // 17:30 on 29 Nov in India
const health = (part: Partial<SourceHealth>): SourceHealth => ({ total: 1, failed: 0, lastOkAt: null, lastFailedAt: null, ...part });

describe("deliveryLine", () => {
  it("lists the five delivery sources in the systems block's order", () => {
    expect(DELIVERY_ORDER).toEqual(["razorpay", "calcom", "oyechats", "brevo", "teams"]);
  });

  it("says when the last good delivery was, as a time today or a date before today", () => {
    expect(deliveryLine("razorpay", health({ lastOkAt: LATER }), NOW)).toEqual({ state: "ok", detail: "last 09:58" });
    expect(deliveryLine("oyechats", health({ lastOkAt: YESTERDAY }), NOW)).toEqual({ state: "ok", detail: "last 29 Nov" });
  });

  it("says all sent for Teams, and none in 24 hours for a quiet source", () => {
    expect(deliveryLine("teams", health({ lastOkAt: LATER }), NOW)).toEqual({ state: "ok", detail: "all sent" });
    expect(deliveryLine("calcom", health({ total: 0 }), NOW)).toEqual({ state: "ok", detail: "none in 24 hours" });
  });

  it("warns when some failed but the latest worked, and is bad when the latest failed", () => {
    expect(deliveryLine("calcom", health({ failed: 1, lastOkAt: LATER, lastFailedAt: EARLY }), NOW)).toEqual({ state: "warn", detail: "1 failed" });
    expect(deliveryLine("brevo", health({ failed: 2, lastOkAt: EARLY, lastFailedAt: LATER }), NOW)).toEqual({ state: "bad", detail: "2 not sent" });
    expect(deliveryLine("razorpay", health({ failed: 1, lastFailedAt: LATER }), NOW)).toEqual({ state: "bad", detail: "1 failed" });
  });
});
