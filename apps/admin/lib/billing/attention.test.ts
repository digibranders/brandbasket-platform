import { paymentAttentionReason } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { PAYMENT_ATTENTION_LABELS } from "./attention";

describe("PAYMENT_ATTENTION_LABELS", () => {
  it("explains every reason the database can hold", () => {
    expect(Object.keys(PAYMENT_ATTENTION_LABELS).sort()).toEqual([...paymentAttentionReason.enumValues].sort());
  });

  it("tells staff a service change that missed the provider also moves the other services to the package price", () => {
    expect(PAYMENT_ATTENTION_LABELS.add_on_provider_pending.action).toMatch(/other services to the package price/);
  });

  it("uses no em or en dashes", () => {
    for (const { title, action } of Object.values(PAYMENT_ATTENTION_LABELS)) expect(`${title} ${action}`).not.toMatch(/[\u2013\u2014]/);
  });

  it("tells staff that an unapplied payment activated nothing", () => {
    for (const reason of ["checkout_replaced", "already_paid", "amount_mismatch"] as const) {
      expect(PAYMENT_ATTENTION_LABELS[reason].action).toMatch(/activated/);
    }
  });
});
