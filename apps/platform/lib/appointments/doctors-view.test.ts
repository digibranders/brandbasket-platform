import { describe, expect, it } from "vitest";
import { bookingDoctorName, buildDayColumns, filterByPractitioner, resolveDoctorFilter, type DoctorRef } from "./doctors-view";

const ASTER: DoctorRef = { id: "11111111-1111-4111-8111-111111111111", name: "Aster Physio" };
const RAHUL: DoctorRef = { id: "22222222-2222-4222-8222-222222222222", name: "Dr Rahul Menon" };
const FORMER: DoctorRef = { id: "33333333-3333-4333-8333-333333333333", name: "Dr Former" };

interface Row {
  readonly id: string;
  readonly practitionerId: string;
  readonly localStart: string;
  readonly localEnd: string;
}

function row(id: string, practitionerId: string, localStart: string, localEnd = "10:00"): Row {
  return { id, practitionerId, localStart, localEnd };
}

describe("resolveDoctorFilter", () => {
  it("keeps an id that names one of two or more active doctors", () => {
    expect(resolveDoctorFilter(RAHUL.id, [ASTER, RAHUL])).toBe(RAHUL.id);
  });

  it("treats a missing param as all doctors", () => {
    expect(resolveDoctorFilter(undefined, [ASTER, RAHUL])).toBeNull();
  });

  it("treats an unknown id as all doctors", () => {
    expect(resolveDoctorFilter(FORMER.id, [ASTER, RAHUL])).toBeNull();
  });

  it("treats a malformed value as all doctors", () => {
    expect(resolveDoctorFilter("not-an-id", [ASTER, RAHUL])).toBeNull();
  });

  it("ignores the param when the clinic has only one active doctor", () => {
    expect(resolveDoctorFilter(ASTER.id, [ASTER])).toBeNull();
  });
});

describe("bookingDoctorName", () => {
  it("names nobody at a one-doctor clinic, matching the website", () => {
    expect(bookingDoctorName(ASTER.id, [ASTER], [ASTER])).toBeNull();
  });

  it("names the doctor once two are active", () => {
    expect(bookingDoctorName(RAHUL.id, [ASTER, RAHUL], [ASTER, RAHUL])).toBe("Dr Rahul Menon");
  });

  it("names an archived doctor even when only one doctor is active now", () => {
    expect(bookingDoctorName(FORMER.id, [ASTER], [ASTER, FORMER])).toBe("Dr Former");
  });

  it("does not name the one active doctor just because another was archived", () => {
    expect(bookingDoctorName(ASTER.id, [ASTER], [ASTER, FORMER])).toBeNull();
  });

  it("is null for an id the page never read", () => {
    expect(bookingDoctorName("44444444-4444-4444-8444-444444444444", [ASTER, RAHUL], [ASTER, RAHUL])).toBeNull();
  });
});

describe("filterByPractitioner", () => {
  const rows = [row("a", ASTER.id, "09:00"), row("b", RAHUL.id, "14:00"), row("c", ASTER.id, "15:00")];

  it("returns every row, in order, for all doctors", () => {
    expect(filterByPractitioner(rows, null)).toEqual(rows);
  });

  it("keeps only the chosen doctor's rows, in order", () => {
    expect(filterByPractitioner(rows, ASTER.id).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("returns nothing for a doctor with no rows", () => {
    expect(filterByPractitioner(rows, FORMER.id)).toEqual([]);
  });
});

describe("buildDayColumns", () => {
  it("gives every active doctor a column, in display order, even with no bookings", () => {
    const columns = buildDayColumns([row("a", RAHUL.id, "14:00", "14:30")], [ASTER, RAHUL], [ASTER, RAHUL]);
    expect(columns.doctors).toEqual([ASTER, RAHUL]);
  });

  it("makes one time row per distinct start, sorted, labelled with its first booking's end", () => {
    const columns = buildDayColumns(
      [row("b", RAHUL.id, "14:00", "14:30"), row("a", ASTER.id, "09:00", "09:30"), row("c", ASTER.id, "14:00", "14:30")],
      [ASTER, RAHUL],
      [ASTER, RAHUL],
    );
    expect(columns.times).toEqual([
      { start: "09:00", end: "09:30" },
      { start: "14:00", end: "14:30" },
    ]);
  });

  it("places each booking under its doctor and start", () => {
    const columns = buildDayColumns(
      [row("a", ASTER.id, "09:00", "09:30"), row("b", RAHUL.id, "14:00", "14:30"), row("c", ASTER.id, "14:00", "14:30")],
      [ASTER, RAHUL],
      [ASTER, RAHUL],
    );
    expect(columns.cell(ASTER.id, "09:00").map((r) => r.id)).toEqual(["a"]);
    expect(columns.cell(RAHUL.id, "09:00")).toEqual([]);
    expect(columns.cell(RAHUL.id, "14:00").map((r) => r.id)).toEqual(["b"]);
    expect(columns.cell(ASTER.id, "14:00").map((r) => r.id)).toEqual(["c"]);
  });

  it("keeps several bookings for one doctor and start together (a cancelled one and its replacement)", () => {
    const columns = buildDayColumns([row("a", ASTER.id, "09:00"), row("b", ASTER.id, "09:00")], [ASTER, RAHUL], [ASTER, RAHUL]);
    expect(columns.cell(ASTER.id, "09:00").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("adds a column after the active ones for an archived doctor who still has a booking that day", () => {
    const columns = buildDayColumns([row("a", FORMER.id, "09:00")], [ASTER, RAHUL], [FORMER, ASTER, RAHUL]);
    expect(columns.doctors).toEqual([ASTER, RAHUL, FORMER]);
    expect(columns.cell(FORMER.id, "09:00").map((r) => r.id)).toEqual(["a"]);
  });

  it("names a doctor it has never heard of plainly rather than dropping their booking", () => {
    const unknownId = "44444444-4444-4444-8444-444444444444";
    const columns = buildDayColumns([row("a", unknownId, "09:00")], [ASTER, RAHUL], [ASTER, RAHUL]);
    expect(columns.doctors.at(-1)).toEqual({ id: unknownId, name: "Doctor" });
  });
});
