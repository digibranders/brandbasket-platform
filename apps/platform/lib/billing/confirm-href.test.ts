import { describe, expect, it, vi } from "vitest";
import type { PaymentConfirmation } from "@/lib/server/payment-confirmation";
import { hrefAfter } from "./confirm-href";

vi.mock("server-only", () => ({}));

const kinds: readonly PaymentConfirmation[] = [
  { kind: "invalid" },
  { kind: "needs-attention" },
  { kind: "membership-opened" },
  { kind: "reactivated" },
  { kind: "already-recorded", projectStillOpen: true },
  { kind: "already-recorded", projectStillOpen: false },
  { kind: "paid", submission: {} as never, projectStillOpen: true },
];

describe("where a confirmed payment sends the customer", () => {
  it("lands a plan the payment opened on Overview, with the welcome switched on", () => {
    expect(hrefAfter({ kind: "membership-opened" }, null)).toBe("/?welcome=1");
  });

  it("asks for the welcome only when a payment has just opened the plan", () => {
    for (const result of kinds.filter((each) => each.kind !== "membership-opened")) {
      for (const membership of [null, "managed"] as const) expect(hrefAfter(result, membership)).not.toContain("welcome");
    }
  });

  it("sends a payment that did not open the plan back to Check and send, or to the plan's own page for a membership", () => {
    expect(hrefAfter({ kind: "invalid" }, null)).toBe("/onboarding/review?payment=failed");
    expect(hrefAfter({ kind: "invalid" }, "managed")).toBe("/plan?payment=failed");
  });

  it("says a payment we could not match was received", () => {
    expect(hrefAfter({ kind: "needs-attention" }, "managed")).toBe("/plan?payment=received");
  });

  it("sends a reactivation to Billing and a recorded payment on to the website or the last step", () => {
    expect(hrefAfter({ kind: "reactivated" }, null)).toBe("/billing?payment=received");
    expect(hrefAfter({ kind: "already-recorded", projectStillOpen: false }, null)).toBe("/website");
    expect(hrefAfter({ kind: "already-recorded", projectStillOpen: true }, null)).toBe("/onboarding/review");
  });
});
