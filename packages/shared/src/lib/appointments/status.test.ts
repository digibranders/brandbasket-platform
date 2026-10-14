import { describe, expect, it } from "vitest";
import {
  ACTION_ALLOWED_FROM,
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  isAppointmentAction,
  isAppointmentStatus,
  statusAfter,
  type AppointmentStatus,
} from "./status";

describe("statusAfter", () => {
  it("matches ACTION_ALLOWED_FROM for every (action, from) pair", () => {
    for (const action of APPOINTMENT_ACTIONS) {
      for (const from of APPOINTMENT_STATUSES) {
        const allowed = ACTION_ALLOWED_FROM[action].includes(from);
        const result = statusAfter(action, from);
        if (allowed) expect(result, `${action} from ${from}`).not.toBeNull();
        else expect(result, `${action} from ${from}`).toBeNull();
      }
    }
  });

  it("cancelling a booked appointment cancels it", () => {
    expect(statusAfter("cancel", "booked")).toBe("cancelled");
  });

  it("marking a booked appointment done marks it done", () => {
    expect(statusAfter("done", "booked")).toBe("done");
  });

  it("marking a booked appointment a no-show makes it a no-show", () => {
    expect(statusAfter("no_show", "booked")).toBe("no_show");
  });

  it("is null when the action is not allowed from that status", () => {
    expect(statusAfter("cancel", "cancelled")).toBeNull();
    expect(statusAfter("cancel", "done")).toBeNull();
    expect(statusAfter("cancel", "no_show")).toBeNull();
    expect(statusAfter("done", "cancelled")).toBeNull();
    expect(statusAfter("done", "done")).toBeNull();
    expect(statusAfter("done", "no_show")).toBeNull();
    expect(statusAfter("no_show", "cancelled")).toBeNull();
    expect(statusAfter("no_show", "done")).toBeNull();
    expect(statusAfter("no_show", "no_show")).toBeNull();
  });

  it("is null when `from` is not a real status", () => {
    expect(statusAfter("cancel", "confirmed" as AppointmentStatus)).toBeNull();
  });
});

describe("type guards", () => {
  it("isAppointmentStatus accepts every published status", () => {
    for (const status of APPOINTMENT_STATUSES) expect(isAppointmentStatus(status)).toBe(true);
    expect(isAppointmentStatus("confirmed")).toBe(false);
  });

  it("isAppointmentAction accepts every action", () => {
    for (const action of APPOINTMENT_ACTIONS) expect(isAppointmentAction(action)).toBe(true);
    expect(isAppointmentAction("confirm")).toBe(false);
  });
});

describe("APPOINTMENT_STATUS_LABELS", () => {
  it("labels every status", () => {
    for (const status of APPOINTMENT_STATUSES) expect(typeof APPOINTMENT_STATUS_LABELS[status]).toBe("string");
  });

  it("shows done as Attended and no_show as No-show", () => {
    expect(APPOINTMENT_STATUS_LABELS.done).toBe("Attended");
    expect(APPOINTMENT_STATUS_LABELS.no_show).toBe("No-show");
  });
});
