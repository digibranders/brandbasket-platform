import { describe, expect, it } from "vitest";
import { paymentNoticeLine, readRequestNotice, requestNoticeLine } from "./notices";

describe("request notices", () => {
  it("reads the three words a refused move comes back with, and nothing else", () => {
    expect(readRequestNotice("changed")).toBe("changed");
    expect(readRequestNotice("window")).toBe("window");
    expect(readRequestNotice("toString")).toBeNull();
    expect(readRequestNotice(["changed"])).toBeNull();
    expect(readRequestNotice(undefined)).toBeNull();
  });

  it("says each in plain words, as a problem", () => {
    expect(requestNoticeLine("window")).toEqual({ ok: false, text: "The 14 days to reopen this are over. Write to us below and we will help." });
    expect(requestNoticeLine("changed").ok).toBe(false);
    expect(requestNoticeLine("failed").text).toBe("That did not work. Please try again.");
  });
});

describe("paymentNoticeLine", () => {
  it("says the change has started when the payment is in, or on its way", () => {
    expect(paymentNoticeLine("paid")).toEqual({ ok: true, text: "Payment received. We have started on your change." });
    expect(paymentNoticeLine("processing")?.text).toContain("Your change starts within a minute or two.");
  });

  it("uses the billing words for a payment that did not go through, which do not point at Billing", () => {
    expect(paymentNoticeLine("failed")).toEqual({ ok: false, text: "That payment didn’t go through, and nothing was taken. You can try again." });
    for (const word of ["failed", "duplicate", "review", "not-open", "stale"]) expect(paymentNoticeLine(word)?.text).not.toMatch(/Billing|below/);
  });

  it("ignores anything it does not know", () => {
    expect(paymentNoticeLine("nope")).toBeNull();
    expect(paymentNoticeLine(undefined)).toBeNull();
  });
});
