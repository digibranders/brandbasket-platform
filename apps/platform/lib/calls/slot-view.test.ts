import { describe, expect, it } from "vitest";
import { bookButtonLabel, defaultReasonOf, splitDayTimes } from "./slot-view";

// Wed 2 Dec 2026 in India: 09:00, 11:30, 12:00, 14:00, 16:30.
const NINE = "2026-12-02T03:30:00.000Z";
const ELEVEN_THIRTY = "2026-12-02T06:00:00.000Z";
const NOON = "2026-12-02T06:30:00.000Z";
const TWO = "2026-12-02T08:30:00.000Z";
const FOUR_THIRTY = "2026-12-02T11:00:00.000Z";

describe("splitDayTimes", () => {
  it("puts times before 12:00 in India under Morning and the rest under Afternoon, in order", () => {
    expect(splitDayTimes([NINE, ELEVEN_THIRTY, NOON, TWO, FOUR_THIRTY])).toEqual({ morning: [NINE, ELEVEN_THIRTY], afternoon: [NOON, TWO, FOUR_THIRTY] });
  });

  it("leaves a part empty when the day has no times in it", () => {
    expect(splitDayTimes([TWO])).toEqual({ morning: [], afternoon: [TWO] });
    expect(splitDayTimes([])).toEqual({ morning: [], afternoon: [] });
  });
});

describe("bookButtonLabel", () => {
  it("asks for a time until one is picked", () => {
    expect(bookButtonLabel(null, false)).toBe("Pick a time");
  });

  it("names the day, date, month and time once one is picked", () => {
    expect(bookButtonLabel(TWO, false)).toBe("Book Wed 2 Dec, 14:00");
  });

  it("says Booking while the booking is on its way", () => {
    expect(bookButtonLabel(TWO, true)).toBe("Booking…");
  });
});

describe("defaultReasonOf", () => {
  const options = [{ value: "website" }, { value: "billing" }, { value: "other" }] as const;

  it("starts from the reason the sheet was opened with", () => {
    expect(defaultReasonOf(options, "billing")).toBe("billing");
  });

  it("falls back to the first option (Website) when none is given or the customer may not pick it", () => {
    expect(defaultReasonOf(options, undefined)).toBe("website");
    expect(defaultReasonOf(options, "search")).toBe("website");
  });

  it("has no reason when there are no options", () => {
    expect(defaultReasonOf([], "billing")).toBeUndefined();
  });
});
