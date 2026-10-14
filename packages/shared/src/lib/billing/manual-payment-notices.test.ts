import { describe, expect, it } from "vitest";
import { manualPaymentNoticeHref, MANUAL_PAYMENT_NOTICES, readManualPaymentNotice } from "./manual-payment-notices";

describe("manual payment notices", () => {
  it("round-trips every notice through the page's query string", () => {
    for (const notice of Object.keys(MANUAL_PAYMENT_NOTICES)) {
      const href = manualPaymentNoticeHref("0192f3c4-1111-7000-8000-000000000001", notice as never);
      const value = new URL(href, "http://admin.localhost").searchParams.get("payment") ?? undefined;
      expect(readManualPaymentNotice(value)).toBe(notice);
    }
  });

  it.each([undefined, "", "toString", "__proto__", "<script>", ["recorded", "recorded"]])(
    "ignores anything else (%s)",
    (value) => {
      expect(readManualPaymentNotice(value)).toBeNull();
    },
  );

  it("marks only a recorded payment and a resolved flag as successes", () => {
    expect(Object.entries(MANUAL_PAYMENT_NOTICES).filter(([, notice]) => notice.ok).map(([key]) => key)).toEqual([
      "recorded",
      "attention-resolved",
    ]);
  });
});
