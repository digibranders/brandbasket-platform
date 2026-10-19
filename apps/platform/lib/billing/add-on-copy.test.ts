import { describe, expect, it, vi } from "vitest";
import type { AddOnView } from "@brandbasket/shared/lib/billing/add-on-state";
import { addOnEndMessage } from "@brandbasket/shared/server/add-on-ends";
import {
  addOnActionLabel,
  addOnDate,
  addOnStateLine,
  checkoutCopy,
  dayOfMonthLabel,
  checkoutPendingLabel,
  endConfirmQuestion,
  endPendingLabel,
  endSavedText,
  keepDateOf,
  keptNoticeDate,
  pressReleaseStatusLabel,
  testCheckoutCopy,
  type CheckoutCopyInput,
} from "./add-on-copy";

vi.mock("server-only", () => ({}));

// 10:00 on 12 November 2026 in India.
const NOV_12 = new Date("2026-11-12T04:30:00Z");
// 23:30 on 11 November in UTC, already 12 November in India.
const LATE_UTC = new Date("2026-11-11T23:30:00Z");

describe("addOnDate", () => {
  it("reads like 12 November 2026, in India time", () => {
    expect(addOnDate(NOV_12)).toBe("12 November 2026");
    expect(addOnDate(LATE_UTC)).toBe("12 November 2026");
  });
});

describe("dayOfMonthLabel", () => {
  it("adds the ordinal, in India time", () => {
    expect(dayOfMonthLabel(new Date("2026-11-01T06:00:00Z"))).toBe("1st");
    expect(dayOfMonthLabel(new Date("2026-11-02T06:00:00Z"))).toBe("2nd");
    expect(dayOfMonthLabel(new Date("2026-11-03T06:00:00Z"))).toBe("3rd");
    expect(dayOfMonthLabel(NOV_12)).toBe("12th");
    expect(dayOfMonthLabel(new Date("2026-11-21T06:00:00Z"))).toBe("21st");
    expect(dayOfMonthLabel(new Date("2026-11-22T06:00:00Z"))).toBe("22nd");
    expect(dayOfMonthLabel(new Date("2026-11-23T06:00:00Z"))).toBe("23rd");
    expect(dayOfMonthLabel(new Date("2026-10-31T06:00:00Z"))).toBe("31st");
    expect(dayOfMonthLabel(LATE_UTC)).toBe("12th");
  });
});

describe("addOnStateLine", () => {
  const net = { netCents: 10_000 * 100, taxRateBasisPoints: 1_800, currency: "INR" } as const;
  const cases: ReadonlyArray<readonly [string, AddOnView, string | null]> = [
    ["none", { state: "none" }, null],
    ["ended", { state: "ended" }, null],
    ["active", { state: "active", renewsOn: NOV_12 }, "Active. Renews on 12 November 2026 at ₹10,000 + GST."],
    ["ending", { state: "ending", endsOn: NOV_12 }, "Ends on 12 November 2026. You can use it until then."],
    ["pausing", { state: "pausing", pausesOn: NOV_12 }, "Pauses on 12 November 2026. You can use it until then."],
    ["paused", { state: "paused", since: NOV_12 }, "Paused since 12 November 2026."],
    ["starting", { state: "starting", since: NOV_12 }, "Starting on 12 November 2026. We're taking the first payment."],
    [
      "failing",
      { state: "failing" },
      "Your last payment didn't go through. Razorpay will try again over the next 3 days.",
    ],
    [
      "failed",
      { state: "failed", payBy: NOV_12 },
      "We couldn't take your payment. Pay by 12 November 2026 to keep it running.",
    ],
  ];

  it.each(cases)("says the %s state", (_name, view, expected) => {
    expect(addOnStateLine(view, net)).toBe(expected);
  });

  it("shows the net price a member pays, not the list price", () => {
    expect(addOnStateLine({ state: "active", renewsOn: NOV_12 }, { ...net, netCents: 9_000 * 100 })).toBe(
      "Active. Renews on 12 November 2026 at ₹9,000 + GST.",
    );
  });

  it("says a dollar price with no GST", () => {
    expect(addOnStateLine({ state: "active", renewsOn: NOV_12 }, { netCents: 12_500, taxRateBasisPoints: 0, currency: "USD" })).toBe(
      "Active. Renews on 12 November 2026 at $125.",
    );
  });

  it("uses no em or en dashes in any state", () => {
    for (const [, view] of cases) expect(addOnStateLine(view, net) ?? "").not.toMatch(/[\u2013\u2014]/);
  });
});

describe("addOnActionLabel", () => {
  it("starts every aria-label with the visible words and names the add-on", () => {
    expect(addOnActionLabel("buy", "Social media")).toEqual({ text: "Get it", ariaLabel: "Get it for Social media" });
    expect(addOnActionLabel("pause", "Social media")).toEqual({ text: "Pause", ariaLabel: "Pause Social media" });
    expect(addOnActionLabel("cancel", "Social media")).toEqual({ text: "Cancel", ariaLabel: "Cancel Social media" });
    expect(addOnActionLabel("keep", "Social media")).toEqual({ text: "Keep it", ariaLabel: "Keep it for Social media" });
    expect(addOnActionLabel("resume", "Social media")).toEqual({ text: "Resume", ariaLabel: "Resume Social media" });
    expect(addOnActionLabel("pay-now", "Social media")).toEqual({ text: "Pay now", ariaLabel: "Pay now for Social media" });
  });
});

describe("endConfirmQuestion", () => {
  it("says exactly what will happen", () => {
    expect(endConfirmQuestion("cancel", "Social media", "12 November 2026")).toBe(
      "Cancel Social media? It stops on 12 November 2026 and you won't be charged again.",
    );
    expect(endConfirmQuestion("pause", "Social media", "12 November 2026")).toBe(
      "Pause Social media? It pauses on 12 November 2026; resume any time.",
    );
  });
});

describe("endSavedText", () => {
  it("is the very sentence the server says when it schedules the end", () => {
    for (const endKind of ["cancel", "pause"] as const) {
      const server = addOnEndMessage({ kind: "scheduled", addOn: "social-media", endKind, endsOn: NOV_12 });
      expect(endSavedText(endKind, "Social media", addOnDate(NOV_12))).toBe(server);
    }
  });
});

describe("checkoutCopy", () => {
  const base: CheckoutCopyInput = {
    intent: "buy",
    addOnId: "social-media",
    title: "Social media",
    monthly: true,
    chargeDate: null,
    renewDay: "12th",
  };
  const renews = "Renews every month on the 12th. Pause or cancel any time; it stops at the end of the month you've paid for.";
  const contact = "After you pay, our team will contact you to get started.";

  it("explains a monthly purchase", () => {
    expect(checkoutCopy(base)).toEqual({
      heading: "Get Social media",
      lead: null,
      totalLabel: "Total today",
      notes: [renews, contact],
    });
  });

  it("adds the ad platforms line for Advertising", () => {
    const copy = checkoutCopy({ ...base, addOnId: "advertising", title: "Advertising" });
    expect(copy.notes).toEqual([renews, "This is Brandbasket's fee. You pay the ad platforms directly.", contact]);
  });

  it("names the action in the heading for Resume and Pay now", () => {
    expect(checkoutCopy({ ...base, intent: "resume" }).heading).toBe("Resume Social media");
    expect(checkoutCopy({ ...base, intent: "pay-now" }).heading).toBe("Pay for Social media");
  });

  it("keeps the contact line for Resume, which staff see again, but drops it for Pay now, which they already know", () => {
    expect(checkoutCopy({ ...base, intent: "resume" }).notes).toEqual([renews, contact]);
    const payNow = checkoutCopy({ ...base, intent: "pay-now" });
    expect(payNow.notes).toEqual([renews]);
    expect(payNow.totalLabel).toBe("Total today");
  });

  it("for Keep it says when the card is charged, totals on that date, and promises no call", () => {
    const copy = checkoutCopy({ ...base, intent: "keep", chargeDate: "12 November 2026" });
    expect(copy.heading).toBe("Keep Social media");
    expect(copy.lead).toBe("Your card will be charged on 12 November 2026.");
    expect(copy.totalLabel).toBe("Total on 12 November 2026");
    expect(copy.notes).toEqual([renews]);
    expect(copy.notes.join(" ")).not.toContain("contact you");
  });

  it("for a renewal day that some months do not have, says the last day of shorter months", () => {
    const shorter = (day: string): string =>
      `Renews every month on the ${day}, or the last day of shorter months. Pause or cancel any time; it stops at the end of the month you've paid for.`;
    for (const day of ["29th", "30th", "31st"]) {
      expect(checkoutCopy({ ...base, renewDay: day }).notes[0]).toBe(shorter(day));
    }
  });

  it("leaves days 1 to 28 as they were", () => {
    for (const day of ["1st", "2nd", "3rd", "11th", "12th", "21st", "22nd", "23rd", "28th"]) {
      expect(checkoutCopy({ ...base, renewDay: day }).notes[0]).toBe(
        `Renews every month on the ${day}. Pause or cancel any time; it stops at the end of the month you've paid for.`,
      );
    }
  });

  it("refuses a renewal day it cannot read", () => {
    expect(() => checkoutCopy({ ...base, renewDay: "the twelfth" })).toThrow(RangeError);
  });

  it("refuses a Keep it with no charge date", () => {
    expect(() => checkoutCopy({ ...base, intent: "keep" })).toThrow(RangeError);
  });

  it("refuses a monthly purchase with no renewal day", () => {
    expect(() => checkoutCopy({ ...base, renewDay: null })).toThrow(RangeError);
  });

  it("uses no em or en dashes", () => {
    const copy = checkoutCopy({ ...base, intent: "keep", chargeDate: "12 November 2026", addOnId: "advertising" });
    expect(JSON.stringify(copy)).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("keptNoticeDate", () => {
  it("is the old billing date, wherever the row has got to", () => {
    expect(keptNoticeDate({ state: "active", renewsOn: NOV_12 })).toEqual(NOV_12);
    expect(keptNoticeDate({ state: "ending", endsOn: NOV_12 })).toEqual(NOV_12);
    expect(keptNoticeDate({ state: "pausing", pausesOn: NOV_12 })).toEqual(NOV_12);
    expect(keptNoticeDate({ state: "starting", since: NOV_12 })).toEqual(NOV_12);
  });

  it("is null when the add-on is in no state a Keep it could have left it in", () => {
    expect(keptNoticeDate({ state: "none" })).toBeNull();
    expect(keptNoticeDate({ state: "ended" })).toBeNull();
    expect(keptNoticeDate({ state: "paused", since: NOV_12 })).toBeNull();
    expect(keptNoticeDate({ state: "failing" })).toBeNull();
    expect(keptNoticeDate({ state: "failed", payBy: NOV_12 })).toBeNull();
  });
});

describe("pressReleaseStatusLabel", () => {
  it("says where a press release has got to in the customer's words", () => {
    expect(pressReleaseStatusLabel("waiting")).toBe("We'll contact you");
    expect(pressReleaseStatusLabel("in_progress")).toBe("In progress");
    expect(pressReleaseStatusLabel("published")).toBe("Published");
  });
});

describe("testCheckoutCopy", () => {
  it("is a payment for anything that is not a keep", () => {
    expect(testCheckoutCopy("Social media", null)).toEqual({
      body: "This page stands in for the payment provider while payments are simulated. Pay records the payment for Social media; Cancel takes you back with nothing recorded.",
      buttonLabel: "Pay",
    });
  });

  it("is an authorisation for a keep, naming the date nothing is charged before", () => {
    expect(testCheckoutCopy("Social media", NOV_12)).toEqual({
      body: "This page stands in for the payment provider while payments are simulated. Confirm records the authorisation. Nothing is charged until 12 November 2026. Cancel takes you back with nothing recorded.",
      buttonLabel: "Confirm",
    });
  });

  it("uses no em or en dashes", () => {
    expect(JSON.stringify(testCheckoutCopy("Social media", NOV_12))).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("keepDateOf", () => {
  it("is the day the add-on was going to end or pause", () => {
    expect(keepDateOf({ state: "ending", endsOn: NOV_12 })).toEqual(NOV_12);
    expect(keepDateOf({ state: "pausing", pausesOn: NOV_12 })).toEqual(NOV_12);
  });

  it("is null in every other state, so a Keep it offered there can be shown as broken instead of throwing", () => {
    expect(keepDateOf({ state: "none" })).toBeNull();
    expect(keepDateOf({ state: "ended" })).toBeNull();
    expect(keepDateOf({ state: "active", renewsOn: NOV_12 })).toBeNull();
    expect(keepDateOf({ state: "paused", since: NOV_12 })).toBeNull();
    expect(keepDateOf({ state: "starting", since: NOV_12 })).toBeNull();
    expect(keepDateOf({ state: "failing" })).toBeNull();
    expect(keepDateOf({ state: "failed", payBy: NOV_12 })).toBeNull();
  });
});

describe("pending labels", () => {
  it("name what is happening and to which add-on, and start with the words the button shows", () => {
    expect(endPendingLabel("pause", "Social media")).toEqual({ text: "Pausing…", ariaLabel: "Pausing Social media" });
    expect(endPendingLabel("cancel", "Social media")).toEqual({ text: "Cancelling…", ariaLabel: "Cancelling Social media" });
    expect(checkoutPendingLabel("Social media")).toEqual({ text: "Opening payment…", ariaLabel: "Opening payment for Social media" });
  });

  it("use no em or en dashes", () => {
    expect(JSON.stringify([endPendingLabel("pause", "A"), endPendingLabel("cancel", "A"), checkoutPendingLabel("A")])).not.toMatch(/[\u2013\u2014]/);
  });
});
