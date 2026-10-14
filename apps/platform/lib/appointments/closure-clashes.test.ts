import { describe, expect, it } from "vitest";
import { closureClashes, type ClashCandidate } from "./closure-clashes";

function row(overrides: Partial<ClashCandidate>): ClashCandidate {
  return {
    id: "a1",
    practitionerId: "doc-1",
    patientName: "Priya Shah",
    localDate: "2026-10-14",
    localStart: "12:00",
    localEnd: "12:30",
    status: "booked",
    ...overrides,
  };
}

const RANGE = { startsOn: "2026-10-14", endsOn: "2026-10-15" };

describe("closureClashes", () => {
  it("lists the still-booked appointments of every doctor on the closed days, keeping the order it was given", () => {
    const rows = [
      row({ id: "a1", practitionerId: "doc-1", localDate: "2026-10-14" }),
      row({ id: "a2", practitionerId: "doc-2", localDate: "2026-10-14", localStart: "13:00", localEnd: "13:30", patientName: "Aarav" }),
      row({ id: "a3", practitionerId: "doc-1", localDate: "2026-10-15", localStart: "10:00", localEnd: "10:30" }),
    ];
    expect(closureClashes(rows, RANGE).map((clash) => clash.appointmentId)).toEqual(["a1", "a2", "a3"]);
  });

  it("carries what the form needs to name each one", () => {
    expect(closureClashes([row({})], RANGE)).toEqual([
      { appointmentId: "a1", patientName: "Priya Shah", localDate: "2026-10-14", localStart: "12:00", localEnd: "12:30" },
    ]);
  });

  it("leaves out cancelled, attended and no-show bookings: they need nothing from the clinic", () => {
    const rows = [row({ id: "c", status: "cancelled" }), row({ id: "d", status: "done" }), row({ id: "n", status: "no_show" })];
    expect(closureClashes(rows, RANGE)).toEqual([]);
  });

  it("leaves out days outside the closure, both ends included", () => {
    const rows = [
      row({ id: "before", localDate: "2026-10-13" }),
      row({ id: "first", localDate: "2026-10-14" }),
      row({ id: "last", localDate: "2026-10-15" }),
      row({ id: "after", localDate: "2026-10-16" }),
    ];
    expect(closureClashes(rows, RANGE).map((clash) => clash.appointmentId)).toEqual(["first", "last"]);
  });

  it("answers an empty list when nothing is booked", () => {
    expect(closureClashes([], RANGE)).toEqual([]);
  });
});
