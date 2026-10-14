import { describe, expect, it, vi } from "vitest";
import {
  archiveRefusalMessage,
  DOCTOR_LIMIT_MESSAGE,
  DOCTOR_NOT_FOUND_MESSAGE,
  leaveClashes,
  parseAddDoctorCommand,
  parseAddLeaveCommand,
  parseArchiveDoctorCommand,
  parseMoveDoctorCommand,
  parseRemoveLeaveCommand,
  parseScheduleCommand,
  parseUpdateDoctorCommand,
  type ClashCandidate,
} from "./commands";

// parseHoursForm (lib/onboarding/business-form.ts) is marked server-only; the parsing itself is plain.
vi.mock("server-only", () => ({}));

const DOCTOR_ID = "0192f3c4-2222-7000-8000-000000000001";
const OTHER_DOCTOR_ID = "0192f3c4-2222-7000-8000-000000000002";
const LEAVE_ID = "0192f3c4-3333-7000-8000-000000000001";

function formData(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const NOT_FOUND = { success: false, field: null, message: DOCTOR_NOT_FOUND_MESSAGE };

describe("parseAddDoctorCommand", () => {
  it("parses a name and title", () => {
    expect(parseAddDoctorCommand(formData({ name: " Dr Rahul Menon ", title: "Sports physiotherapist" }))).toEqual({
      success: true,
      data: { name: "Dr Rahul Menon", title: "Sports physiotherapist" },
    });
  });

  it("treats a missing title as none", () => {
    expect(parseAddDoctorCommand(formData({ name: "Dr Rahul Menon" }))).toEqual({
      success: true,
      data: { name: "Dr Rahul Menon", title: null },
    });
  });

  it("asks for a name", () => {
    expect(parseAddDoctorCommand(formData({ name: "" }))).toEqual({
      success: false,
      field: "name",
      message: "Enter the doctor's name.",
    });
  });
});

describe("DOCTOR_LIMIT_MESSAGE", () => {
  it("names the limit", () => {
    expect(DOCTOR_LIMIT_MESSAGE).toBe("You can list up to 20 doctors.");
  });
});

describe("parseUpdateDoctorCommand", () => {
  it("parses the id, name and title", () => {
    expect(parseUpdateDoctorCommand(formData({ practitionerId: DOCTOR_ID, name: "Dr Meera Iyer", title: "" }))).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID, fields: { name: "Dr Meera Iyer", title: null } },
    });
  });

  it("refuses an id that isn't a uuid before looking at the fields", () => {
    expect(parseUpdateDoctorCommand(formData({ practitionerId: "nope", name: "" }))).toEqual(NOT_FOUND);
  });

  it("passes a field problem through", () => {
    expect(parseUpdateDoctorCommand(formData({ practitionerId: DOCTOR_ID, name: "Dr Meera", title: "y".repeat(81) }))).toEqual({
      success: false,
      field: "title",
      message: "Keep the title to 80 characters.",
    });
  });
});

describe("parseScheduleCommand", () => {
  it("parses clinic hours, ignoring any own hours sent with it", () => {
    const data = formData({ practitionerId: DOCTOR_ID, schedule: "clinic", "hours.1.mode": "open", "hours.1.opens": "14:00" });
    expect(parseScheduleCommand(data)).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID, schedule: { usesClinicHours: true } },
    });
  });

  it("parses own hours into stored rows", () => {
    const data = formData({
      practitionerId: DOCTOR_ID,
      schedule: "own",
      "hours.1.mode": "open",
      "hours.1.opens": "14:00",
      "hours.1.closes": "18:00",
      "hours.3.mode": "open",
      "hours.3.opens": "14:00",
      "hours.3.closes": "18:00",
      "hours.6.mode": "closed",
    });
    expect(parseScheduleCommand(data)).toEqual({
      success: true,
      data: {
        practitionerId: DOCTOR_ID,
        schedule: {
          usesClinicHours: false,
          hours: [
            { dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00", closed: false, openAllDay: false },
            { dayOfWeek: 3, opensAt: "14:00", closesAt: "18:00", closed: false, openAllDay: false },
            { dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
          ],
        },
      },
    });
  });

  it("counts a day open 24 hours as a working day", () => {
    const data = formData({ practitionerId: DOCTOR_ID, schedule: "own", "hours.0.mode": "all-day" });
    const result = parseScheduleCommand(data);
    expect(result.success).toBe(true);
  });

  it("refuses own hours with no working day", () => {
    const data = formData({ practitionerId: DOCTOR_ID, schedule: "own", "hours.0.mode": "closed" });
    expect(parseScheduleCommand(data)).toEqual({
      success: false,
      field: "hours.0.mode",
      message: "Set at least one working day, or choose Clinic hours.",
    });
  });

  it("passes the hours parser's own problem through, naming the field", () => {
    const data = formData({ practitionerId: DOCTOR_ID, schedule: "own", "hours.2.mode": "open", "hours.2.opens": "", "hours.2.closes": "18:00" });
    const result = parseScheduleCommand(data);
    expect(result.success === false && result.field).toBe("hours.2.opens");
  });

  it("refuses an unknown schedule choice", () => {
    expect(parseScheduleCommand(formData({ practitionerId: DOCTOR_ID, schedule: "weekends" }))).toEqual({
      success: false,
      field: "schedule",
      message: "Choose clinic hours or own hours.",
    });
  });

  it("refuses an id that isn't a uuid", () => {
    expect(parseScheduleCommand(formData({ practitionerId: "", schedule: "clinic" }))).toEqual(NOT_FOUND);
  });
});

describe("parseAddLeaveCommand", () => {
  it("parses the doctor and the leave dates", () => {
    const data = formData({ practitionerId: DOCTOR_ID, startsOn: "2026-10-05", endsOn: "2026-10-07", note: "Conference" });
    expect(parseAddLeaveCommand(data)).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID, leave: { startsOn: "2026-10-05", endsOn: "2026-10-07", note: "Conference", opensAt: null, closesAt: null } },
    });
  });

  it("passes the closure parser's own problem through", () => {
    const data = formData({ practitionerId: DOCTOR_ID, startsOn: "2026-10-07", endsOn: "2026-10-05" });
    expect(parseAddLeaveCommand(data)).toEqual({
      success: false,
      field: "endsOn",
      message: "The last day can't be before the first.",
    });
  });

  it("refuses an id that isn't a uuid", () => {
    expect(parseAddLeaveCommand(formData({ practitionerId: "x", startsOn: "2026-10-05", endsOn: "2026-10-05" }))).toEqual(NOT_FOUND);
  });
});

describe("parseRemoveLeaveCommand", () => {
  it("parses the leave id", () => {
    expect(parseRemoveLeaveCommand(formData({ leaveId: LEAVE_ID }))).toEqual({ success: true, data: { leaveId: LEAVE_ID } });
  });

  it("refuses an id that isn't a uuid", () => {
    expect(parseRemoveLeaveCommand(formData({ leaveId: "x" }))).toEqual({
      success: false,
      field: null,
      message: "That leave could not be found. Reload the page.",
    });
  });
});

describe("parseMoveDoctorCommand", () => {
  it("parses up and down", () => {
    expect(parseMoveDoctorCommand(formData({ practitionerId: DOCTOR_ID, direction: "up" }))).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID, direction: "up" },
    });
    expect(parseMoveDoctorCommand(formData({ practitionerId: DOCTOR_ID, direction: "down" }))).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID, direction: "down" },
    });
  });

  it("refuses any other direction", () => {
    expect(parseMoveDoctorCommand(formData({ practitionerId: DOCTOR_ID, direction: "left" }))).toEqual(NOT_FOUND);
  });

  it("refuses an id that isn't a uuid", () => {
    expect(parseMoveDoctorCommand(formData({ practitionerId: "x", direction: "up" }))).toEqual(NOT_FOUND);
  });
});

describe("parseArchiveDoctorCommand", () => {
  it("parses the id", () => {
    expect(parseArchiveDoctorCommand(formData({ practitionerId: DOCTOR_ID }))).toEqual({
      success: true,
      data: { practitionerId: DOCTOR_ID },
    });
  });

  it("refuses an id that isn't a uuid", () => {
    expect(parseArchiveDoctorCommand(formData({ practitionerId: "x" }))).toEqual(NOT_FOUND);
  });
});

describe("archiveRefusalMessage", () => {
  it("is null once archived", () => {
    expect(archiveRefusalMessage("Dr Rahul Menon", { kind: "archived" })).toBeNull();
  });

  it("counts upcoming bookings, plural", () => {
    expect(archiveRefusalMessage("Dr Rahul Menon", { kind: "has_upcoming", count: 4 })).toBe(
      "Dr Rahul Menon has 4 upcoming bookings. Reassign or cancel them first.",
    );
  });

  it("counts one upcoming booking, singular", () => {
    expect(archiveRefusalMessage("Dr Rahul Menon", { kind: "has_upcoming", count: 1 })).toBe(
      "Dr Rahul Menon has 1 upcoming booking. Reassign or cancel it first.",
    );
  });

  it("keeps the last doctor", () => {
    expect(archiveRefusalMessage("Dr Rahul Menon", { kind: "last" })).toBe("Keep at least one doctor.");
  });

  it("reports a doctor that is gone", () => {
    expect(archiveRefusalMessage("Dr Rahul Menon", { kind: "not_found" })).toBe(DOCTOR_NOT_FOUND_MESSAGE);
  });
});

describe("leaveClashes", () => {
  function booking(overrides: Partial<ClashCandidate>): ClashCandidate {
    return {
      id: "0192f3c4-4444-7000-8000-000000000001",
      practitionerId: DOCTOR_ID,
      patientName: "Asha Rao",
      localDate: "2026-10-05",
      localStart: "10:00",
      localEnd: "10:30",
      status: "booked",
      ...overrides,
    };
  }

  it("lists this doctor's booked appointments inside the leave, in the order given", () => {
    const rows = [
      booking({ id: "a", localDate: "2026-10-05", localStart: "10:00" }),
      booking({ id: "b", localDate: "2026-10-07", localStart: "16:00", localEnd: "16:30", patientName: "Vikram Shah" }),
    ];
    expect(leaveClashes(rows, DOCTOR_ID, { startsOn: "2026-10-05", endsOn: "2026-10-07" })).toEqual([
      { appointmentId: "a", patientName: "Asha Rao", localDate: "2026-10-05", localStart: "10:00", localEnd: "10:30" },
      { appointmentId: "b", patientName: "Vikram Shah", localDate: "2026-10-07", localStart: "16:00", localEnd: "16:30" },
    ]);
  });

  it("leaves out other doctors, cancelled and done bookings, and days outside the leave", () => {
    const rows = [
      booking({ id: "other", practitionerId: OTHER_DOCTOR_ID }),
      booking({ id: "cancelled", status: "cancelled" }),
      booking({ id: "done", status: "done" }),
      booking({ id: "before", localDate: "2026-10-04" }),
      booking({ id: "after", localDate: "2026-10-08" }),
    ];
    expect(leaveClashes(rows, DOCTOR_ID, { startsOn: "2026-10-05", endsOn: "2026-10-07" })).toEqual([]);
  });
});
