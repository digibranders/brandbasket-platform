import { CHANGE_STATES } from "@brandbasket/db/change-states";
import { describe, expect, it } from "vitest";
import {
  acceptLabel,
  CLOSED_LABEL,
  CUSTOMER_STATUSES,
  customerStatus,
  customerStepIndex,
  hoursLabel,
  includedEditsAllowed,
  includedEditsUsedLine,
  INCLUDED_EDIT_MINUTES,
  INCLUDED_EDIT_WORKING_DAYS,
  INCLUDED_EDITS_PER_MONTH,
  monthBoundsIst,
  quoteLine,
  quoteTotalCents,
  REOPEN_WINDOW_DAYS,
  ticketStatusWord,
} from "./change-requests";
import { SUPPORT_STATUSES } from "./support";

describe("the included-edits rule", () => {
  it("is two edits of fifteen minutes a month until the owner says otherwise", () => {
    expect(INCLUDED_EDITS_PER_MONTH).toBe(2);
    expect(INCLUDED_EDIT_MINUTES).toBe(15);
    expect(INCLUDED_EDIT_WORKING_DAYS).toBe(2);
    expect(REOPEN_WINDOW_DAYS).toBe(14);
  });

  it("belongs to the Managed Website service only", () => {
    expect(includedEditsAllowed(true)).toBe(2);
    expect(includedEditsAllowed(false)).toBe(0);
    expect(includedEditsUsedLine(1, 2)).toBe("1 of 2 used");
  });
});

describe("customerStatus", () => {
  it("maps the nine states to the five words, and the two endings to Closed", () => {
    expect(CHANGE_STATES.map((state) => [state, customerStatus(state)])).toEqual([
      ["requested", "Sent"],
      ["quoted", "Quoted"],
      ["in_progress", "In progress"],
      ["preview", "Ready to check"],
      ["revisions", "In progress"],
      ["approved", "Done"],
      ["shipped", "Done"],
      ["declined", "Closed"],
      ["withdrawn", "Closed"],
    ]);
  });

  it("numbers the steps from Sent to Done, and gives a closed request none", () => {
    expect(CUSTOMER_STATUSES).toEqual(["Sent", "Quoted", "In progress", "Ready to check", "Done"]);
    expect(CHANGE_STATES.map((state) => customerStepIndex(state))).toEqual([0, 1, 2, 3, 2, 4, 4, null, null]);
    expect(CLOSED_LABEL).toBe("Closed");
  });

  it("gives a question the same words, and tells the customer when the team is waiting on them", () => {
    expect(SUPPORT_STATUSES.map((status) => [status, ticketStatusWord(status)])).toEqual([
      ["new", "Sent"],
      ["triaged", "In progress"],
      ["in_progress", "In progress"],
      ["waiting_on_you", "Waiting for you"],
      ["resolved", "Done"],
      ["closed", "Done"],
    ]);
  });
});

describe("monthBoundsIst", () => {
  it("runs from the first moment of the month in India to the first moment of the next", () => {
    const { from, to } = monthBoundsIst(new Date("2026-11-15T10:00:00.000Z"));
    expect(from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });

  it("puts 00:30 on 1 December in India in December, though it is still 30 November in UTC", () => {
    const { from } = monthBoundsIst(new Date("2026-11-30T19:00:00.000Z"));
    expect(from.toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });

  it("keeps 23:59 on 30 November in India in November", () => {
    const { to } = monthBoundsIst(new Date("2026-11-30T18:29:59.000Z"));
    expect(to.toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });

  it("rolls December over to the next year, and handles a short February", () => {
    expect(monthBoundsIst(new Date("2026-12-20T05:00:00.000Z")).to.toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(monthBoundsIst(new Date("2027-02-10T05:00:00.000Z")).to.toISOString()).toBe("2027-02-28T18:30:00.000Z");
  });
});

describe("the quote in words", () => {
  const quote = { what: "New page", hours: 3, unitCents: 50_000, currency: "INR" as const };

  it("says hours, the hour's price and that GST is in it", () => {
    expect(hoursLabel(1)).toBe("1 hour");
    expect(hoursLabel(3)).toBe("3 hours");
    expect(quoteLine(quote)).toBe("New page, 3 hours at ₹500 an hour, GST included");
  });

  it("does not mention GST for a quote in dollars", () => {
    expect(quoteLine({ what: "New page", hours: 1, unitCents: 1000, currency: "USD" })).toBe("New page, 1 hour at $10 an hour");
  });

  it("works out the total and labels the button with it", () => {
    expect(quoteTotalCents(3, 50_000)).toBe(150_000);
    expect(acceptLabel(150_000, "INR")).toBe("Accept and pay ₹1,500");
  });

  it("refuses hours that are not whole or are out of range, and a price that is not a whole amount", () => {
    expect(() => quoteTotalCents(0, 50_000)).toThrow(RangeError);
    expect(() => quoteTotalCents(41, 50_000)).toThrow(RangeError);
    expect(() => quoteTotalCents(1.5, 50_000)).toThrow(RangeError);
    expect(() => quoteTotalCents(2, 0)).toThrow(RangeError);
  });
});
