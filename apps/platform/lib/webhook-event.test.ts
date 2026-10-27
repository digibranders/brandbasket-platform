import { describe, expect, it } from "vitest";
import { bodyFingerprint, failureReason, webhookEventName } from "@/lib/webhook-event";

describe("webhookEventName", () => {
  it("reads the provider's event field", () => {
    expect(webhookEventName(JSON.stringify({ event: "subscription.charged" }), "event")).toBe("subscription.charged");
    expect(webhookEventName(JSON.stringify({ triggerEvent: "BOOKING_RESCHEDULED" }), "triggerEvent")).toBe("BOOKING_RESCHEDULED");
  });

  it("says unknown for a body that is not JSON, has no such field, or names it with odd characters", () => {
    expect(webhookEventName("not json", "event")).toBe("unknown");
    expect(webhookEventName(JSON.stringify({ other: "x" }), "event")).toBe("unknown");
    expect(webhookEventName(JSON.stringify({ event: "<script>" }), "event")).toBe("unknown");
    expect(webhookEventName(JSON.stringify({ event: "a".repeat(65) }), "event")).toBe("unknown");
  });
});

describe("bodyFingerprint", () => {
  it("is the SHA-256 in hex and the size in bytes", () => {
    expect(bodyFingerprint("abc")).toEqual({ bodySha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", bodyBytes: 3 });
    expect(bodyFingerprint("₹").bodyBytes).toBe(3);
  });
});

describe("failureReason", () => {
  it("names the error's kind, never its message", () => {
    expect(failureReason(new TypeError("card 4242 declined"))).toBe("Handler threw TypeError");
    expect(failureReason("boom")).toBe("Handler threw");
  });
});
