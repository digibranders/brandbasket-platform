import { describe, expect, it } from "vitest";
import {
  ADD_ON_KEPT_CALLBACK_PARAM,
  ADD_ON_PAYMENT_NOTICES,
  addOnCallbackHref,
  addOnConfirmationHref,
  addOnPaymentHref,
  keptNoticeText,
  readAddOnPaymentNotice,
  readKeptAddOn,
} from "./add-on-notices";

describe("readAddOnPaymentNotice", () => {
  it("reads the notices it knows", () => {
    expect(readAddOnPaymentNotice("received")).toBe("received");
    expect(readAddOnPaymentNotice("failed")).toBe("failed");
    expect(readAddOnPaymentNotice("review")).toBe("review");
    expect(readAddOnPaymentNotice("recorded")).toBe("recorded");
    expect(readAddOnPaymentNotice("kept")).toBe("kept");
    expect(readAddOnPaymentNotice("confirming")).toBe("confirming");
    expect(readAddOnPaymentNotice("nothing-due")).toBe("nothing-due");
  });

  it("ignores anything else, including inherited object keys", () => {
    expect(readAddOnPaymentNotice(undefined)).toBeNull();
    expect(readAddOnPaymentNotice(["received"])).toBeNull();
    expect(readAddOnPaymentNotice("toString")).toBeNull();
    expect(readAddOnPaymentNotice("nope")).toBeNull();
  });
});

describe("readKeptAddOn", () => {
  it("reads the monthly add-ons", () => {
    expect(readKeptAddOn("social-media")).toBe("social-media");
    expect(readKeptAddOn("advertising")).toBe("advertising");
  });

  it("ignores the press release, other text, a missing value and a list", () => {
    expect(readKeptAddOn("press-release")).toBeNull();
    expect(readKeptAddOn("toString")).toBeNull();
    expect(readKeptAddOn("")).toBeNull();
    expect(readKeptAddOn(null)).toBeNull();
    expect(readKeptAddOn(undefined)).toBeNull();
    expect(readKeptAddOn(["social-media"])).toBeNull();
  });
});

describe("addOnPaymentHref", () => {
  it("points at the Add-ons page", () => {
    expect(addOnPaymentHref("received")).toBe("/add-ons?payment=received");
    expect(addOnPaymentHref("failed")).toBe("/add-ons?payment=failed");
  });

  it("names the add-on that was kept", () => {
    expect(addOnPaymentHref("kept", "social-media")).toBe("/add-ons?payment=kept&addOn=social-media");
    expect(addOnPaymentHref("kept")).toBe("/add-ons?payment=kept");
  });
});

describe("addOnCallbackHref", () => {
  it("says received for a signed payment and failed for anything else", () => {
    expect(addOnCallbackHref(true, null)).toBe("/add-ons?payment=received");
    expect(addOnCallbackHref(false, null)).toBe("/add-ons?payment=failed");
  });

  it("sends a signed Keep it return to the kept notice, never to received", () => {
    expect(addOnCallbackHref(true, "social-media")).toBe("/add-ons?payment=kept&addOn=social-media");
  });

  it("says failed for a Keep it return that was not signed", () => {
    expect(addOnCallbackHref(false, "social-media")).toBe("/add-ons?payment=failed");
  });
});

describe("addOnConfirmationHref", () => {
  it("maps each way the test checkout can end to a notice", () => {
    expect(addOnConfirmationHref("paid", "social-media")).toBe("/add-ons?payment=received");
    expect(addOnConfirmationHref("already-recorded", "social-media")).toBe("/add-ons?payment=recorded");
    expect(addOnConfirmationHref("needs-attention", "social-media")).toBe("/add-ons?payment=review");
    expect(addOnConfirmationHref("invalid", "social-media")).toBe("/add-ons?payment=failed");
  });

  it("sends an authorised Keep it to the kept notice, never to received", () => {
    expect(addOnConfirmationHref("authorised", "advertising")).toBe(
      "/add-ons?payment=kept&addOn=advertising",
    );
  });
});

describe("keptNoticeText", () => {
  it("names the add-on and the date", () => {
    expect(keptNoticeText("Social media", "12 November 2026")).toBe("Done. Social media carries on after 12 November 2026.");
  });
});

describe("ADD_ON_KEPT_CALLBACK_PARAM", () => {
  it("is the query mark the pay page puts on a Keep it callback address", () => {
    expect(ADD_ON_KEPT_CALLBACK_PARAM).toBe("kept");
  });
});

describe("ADD_ON_PAYMENT_NOTICES", () => {
  it("is plain English with no em or en dashes", () => {
    for (const { text } of Object.values(ADD_ON_PAYMENT_NOTICES)) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
    expect(keptNoticeText("Social media", "12 November 2026")).not.toMatch(/[\u2013\u2014]/);
  });

  it("says a payment still being confirmed is not yet received", () => {
    expect(ADD_ON_PAYMENT_NOTICES.confirming).toEqual({
      ok: true,
      text: "We're confirming your payment. It shows here once Razorpay confirms it.",
    });
    expect(ADD_ON_PAYMENT_NOTICES.confirming.text).not.toMatch(/received/i);
  });

  it("says a press release with no charge waiting has nothing to pay", () => {
    expect(ADD_ON_PAYMENT_NOTICES["nothing-due"].text).toBe("This press release has no payment waiting.");
  });

  it("never says Payment received for a kept add-on", () => {
    expect(ADD_ON_PAYMENT_NOTICES.kept.text).not.toMatch(/received/i);
  });
});
