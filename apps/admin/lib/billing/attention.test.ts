import { paymentAttentionReason } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { PAYMENT_ATTENTION_LABELS } from "./attention";

describe("PAYMENT_ATTENTION_LABELS", () => {
  it("explains every reason the database can hold", () => {
    expect(Object.keys(PAYMENT_ATTENTION_LABELS).sort()).toEqual([...paymentAttentionReason.enumValues].sort());
  });

  it("tells staff that an unapplied payment activated nothing", () => {
    for (const reason of ["checkout_replaced", "already_paid", "amount_mismatch"] as const) {
      expect(PAYMENT_ATTENTION_LABELS[reason].action).toMatch(/activated/);
    }
  });
});
