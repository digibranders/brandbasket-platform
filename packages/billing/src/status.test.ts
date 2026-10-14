import { describe, expect, it } from "vitest";
import { mapRazorpayStatus } from "./status";

describe("mapRazorpayStatus", () => {
  it.each([
    ["created", "incomplete"],
    ["authenticated", "active"],
    ["active", "active"],
    ["pending", "past_due"],
    ["halted", "inactive"],
    ["paused", "inactive"],
    ["cancelled", "cancelled"],
    ["completed", "cancelled"],
    ["expired", "cancelled"],
  ] as const)("maps Razorpay %s to %s", (providerStatus, expected) => {
    expect(mapRazorpayStatus(providerStatus)).toBe(expected);
  });

  it.each(["", "ACTIVE", "refunded", "constructor", "toString", "__proto__"])(
    "treats the unknown status %j as unpaid",
    (providerStatus) => {
      expect(mapRazorpayStatus(providerStatus)).toBe("incomplete");
    },
  );
});
