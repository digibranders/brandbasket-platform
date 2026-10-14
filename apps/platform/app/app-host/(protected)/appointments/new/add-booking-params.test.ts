import { describe, expect, it } from "vitest";
import { addBookingHref, bookedHref, dayViewHref, parseAddBookingParams } from "./add-booking-params";

const DOCTOR_ID = "0192f3c4-1111-7000-8000-000000000001";
const PATIENT_ID = "0192f3c4-2222-7000-8000-000000000002";

describe("parseAddBookingParams", () => {
  it("reads well-formed params", () => {
    expect(parseAddBookingParams({ date: "2026-10-01", doctor: DOCTOR_ID, slot: "09:30", patient: PATIENT_ID })).toEqual({
      date: "2026-10-01",
      doctor: DOCTOR_ID,
      slot: "09:30",
      patient: PATIENT_ID,
    });
  });

  it("falls back to today, any doctor and no time for missing or malformed values", () => {
    expect(parseAddBookingParams({})).toEqual({ date: null, doctor: null, slot: null, patient: null });
    expect(parseAddBookingParams({ date: "2026-02-30", doctor: "any", slot: "9:30", patient: "  " })).toEqual({
      date: null,
      doctor: null,
      slot: null,
      patient: null,
    });
    expect(parseAddBookingParams({ date: ["2026-10-01", "2026-10-02"], doctor: "not-a-uuid", slot: "24:00" })).toEqual({
      date: null,
      doctor: null,
      slot: null,
      patient: null,
    });
  });

  it("keeps a malformed patient so the page can say it was not found", () => {
    expect(parseAddBookingParams({ patient: "nope" }).patient).toBe("nope");
  });
});

describe("links", () => {
  it("writes only the params that are set", () => {
    expect(addBookingHref({ date: "2026-10-01", doctor: null, patient: null, slot: null })).toBe("/appointments/new?date=2026-10-01");
    expect(addBookingHref({ date: "2026-10-01", doctor: DOCTOR_ID, patient: PATIENT_ID, slot: "09:30" })).toBe(
      `/appointments/new?date=2026-10-01&doctor=${DOCTOR_ID}&patient=${PATIENT_ID}&slot=09%3A30`,
    );
  });

  it("closes to the day's Today view and lands a booking with its details open", () => {
    expect(dayViewHref("2026-10-01")).toBe("/appointments?view=today&day=2026-10-01");
    expect(dayViewHref(null)).toBe("/appointments?view=today");
    expect(bookedHref("2026-10-01", PATIENT_ID)).toBe(`/appointments?view=today&day=2026-10-01&booking=${PATIENT_ID}`);
  });
});
