import { describe, expect, it } from "vitest";
import { callAlert, callTimeText } from "./alert-facts";

const START = new Date("2026-10-28T10:00:00.000Z");
const END = new Date("2026-10-28T10:30:00.000Z");
const BASE = {
  kind: "kickoff",
  changed: false,
  startsAt: START,
  endsAt: END,
  previousStartsAt: null,
  previousEndsAt: null,
  services: ["Website", "Social & Ads", "Search"],
  meetingUrl: "https://app.cal.com/video/abc",
  reason: null,
  note: null,
} as const;

describe("callTimeText", () => {
  it("is in India time, with the day, whatever zone the customer booked in", () => {
    expect(callTimeText(START, END)).toBe("Wed, 28 Oct, 3:30 pm to 4:00 pm India time");
  });
});

describe("callAlert", () => {
  it("gives a booked kickoff its time, services and meeting link, with a button to join", () => {
    const alert = callAlert(BASE);
    expect(alert.event).toBe("kickoff_booked");
    expect(alert.facts).toEqual([
      { name: "When", value: "Wed, 28 Oct, 3:30 pm to 4:00 pm India time" },
      { name: "Moved from", value: null },
      { name: "About", value: null },
      { name: "Services", value: "Website, Social & Ads and Search" },
      { name: "Meeting link", value: "https://app.cal.com/video/abc" },
    ]);
    expect(alert.buttons).toEqual([{ label: "Join the call", url: "https://app.cal.com/video/abc" }]);
    expect(alert.text).toBeNull();
  });

  it("says a moved call was moved, and from when", () => {
    const alert = callAlert({ ...BASE, changed: true, previousStartsAt: new Date("2026-10-27T10:00:00.000Z"), previousEndsAt: new Date("2026-10-27T10:30:00.000Z") });
    expect(alert.event).toBe("kickoff_changed");
    expect(alert.facts.find((fact) => fact.name === "Moved from")?.value).toBe("Tue, 27 Oct, 3:30 pm to 4:00 pm India time");
  });

  it("gives a later call what it is about and the customer's note, and leaves out a link it does not have", () => {
    const alert = callAlert({ ...BASE, kind: "call", reason: "social", note: "  Ads for braces ", meetingUrl: null });
    expect(alert.event).toBe("call_booked");
    expect(alert.facts.find((fact) => fact.name === "About")?.value).toBe("Social & Ads");
    expect(alert.facts.find((fact) => fact.name === "Meeting link")?.value).toBeNull();
    expect(alert.text).toBe("Customer's note: Ads for braces");
    expect(alert.buttons).toEqual([]);
  });
});
