import type { AppointmentRow, ReassignResult } from "@fynix/db";
import { describe, expect, it, vi } from "vitest";
import { parseReassignCommand, parseTransitionCommand, runReassignCommand, type ReassignPorts } from "./commands";

const APPOINTMENT_ID = "0192f3c4-1111-7000-8000-000000000001";
const ASTER_ID = "0192f3c4-3333-7000-8000-00000000000a";
const RAHUL_ID = "0192f3c4-3333-7000-8000-00000000000b";
const MEERA_ID = "0192f3c4-3333-7000-8000-00000000000c";
const NOW = new Date("2026-10-05T04:30:00Z");

function formData(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseTransitionCommand", () => {
  it("parses a cancel with a reason", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "cancel", reason: "Patient called to cancel" }));
    expect(result).toEqual({
      success: true,
      data: { appointmentId: APPOINTMENT_ID, transition: { action: "cancel", reason: "Patient called to cancel" } },
    });
  });

  it("parses a cancel with no reason as null", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "cancel" }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "cancel", reason: null } } });
  });

  it("rejects a cancel reason over the limit", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "cancel", reason: "x".repeat(201) }));
    expect(result).toEqual({ success: false, field: "reason", message: "Keep the reason to 200 characters." });
  });

  it("accepts a cancel reason at exactly the limit", () => {
    const reason = "x".repeat(200);
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "cancel", reason }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "cancel", reason } } });
  });

  it("turns a whitespace-only cancel reason into null", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "cancel", reason: "   " }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "cancel", reason: null } } });
  });

  it("parses done with no other fields", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "done" }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "done" } } });
  });

  it("parses no_show with no other fields", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "no_show" }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "no_show" } } });
  });

  it("ignores a reason posted alongside an outcome", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "no_show", reason: "Did not come" }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, transition: { action: "no_show" } } });
  });

  it("rejects an unrecognised action", () => {
    const result = parseTransitionCommand(formData({ appointmentId: APPOINTMENT_ID, action: "confirm" }));
    expect(result.success).toBe(false);
  });

  it("rejects a missing action field entirely", () => {
    const data = new FormData();
    data.set("appointmentId", APPOINTMENT_ID);
    const result = parseTransitionCommand(data);
    expect(result.success).toBe(false);
  });

  it("rejects an appointment id that isn't a uuid", () => {
    const result = parseTransitionCommand(formData({ appointmentId: "not-a-uuid", action: "done" }));
    expect(result.success).toBe(false);
  });
});

describe("parseReassignCommand", () => {
  it("parses a booking id and a target doctor id", () => {
    const result = parseReassignCommand(formData({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toEqual({ success: true, data: { appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID } });
  });

  it("asks for a doctor when none was chosen", () => {
    const result = parseReassignCommand(formData({ appointmentId: APPOINTMENT_ID, practitionerId: "" }));
    expect(result).toEqual({ success: false, field: "practitionerId", message: "Choose a doctor." });
  });

  it("rejects a doctor id that isn't a uuid", () => {
    const result = parseReassignCommand(formData({ appointmentId: APPOINTMENT_ID, practitionerId: "rahul" }));
    expect(result.success).toBe(false);
  });

  it("rejects an appointment id that isn't a uuid", () => {
    const result = parseReassignCommand(formData({ appointmentId: "nope", practitionerId: RAHUL_ID }));
    expect(result.success).toBe(false);
  });
});

describe("runReassignCommand", () => {
  function booking(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
    return {
      id: APPOINTMENT_ID,
      practitionerId: ASTER_ID,
      patientId: "0192f3c4-4444-7000-8000-000000000001",
      patientName: "Arjun Menon",
      phone: "+919876543210",
      email: null,
      serviceId: null,
      serviceName: "Sports injury rehab",
      patientNote: null,
      localDate: "2026-10-08",
      localStart: "15:00",
      localEnd: "15:30",
      startsAt: new Date("2026-10-08T09:30:00Z"),
      endsAt: new Date("2026-10-08T10:00:00Z"),
      status: "booked",
      cancelReason: null,
      clinicNote: null,
      cancelledAt: null,
      doneAt: null,
      noShowAt: null,
      source: "online",
      createdAt: new Date("2026-09-20T00:00:00Z"),
      handledByUserId: null,
      seenAt: null,
      ...overrides,
    };
  }

  function ports(overrides: Partial<{ found: AppointmentRow | null; free: readonly string[]; result: ReassignResult }> = {}): ReassignPorts & {
    readonly reassign: ReturnType<typeof vi.fn<ReassignPorts["reassign"]>>;
  } {
    const found = "found" in overrides ? (overrides.found ?? null) : booking();
    return {
      findBooking: vi.fn<ReassignPorts["findBooking"]>().mockResolvedValue(found),
      freeDoctorIds: vi.fn<ReassignPorts["freeDoctorIds"]>().mockResolvedValue(overrides.free ?? [RAHUL_ID, MEERA_ID]),
      reassign: vi.fn<ReassignPorts["reassign"]>().mockResolvedValue(overrides.result ?? "reassigned"),
    };
  }

  const command = { appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID };

  it("reassigns to a doctor who is free then", async () => {
    const deps = ports();
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("reassigned");
    expect(deps.reassign).toHaveBeenCalledWith(APPOINTMENT_ID, RAHUL_ID);
  });

  it("refuses a doctor who isn't working then, without trying the move", async () => {
    const deps = ports({ free: [MEERA_ID] });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("not_free");
    expect(deps.reassign).not.toHaveBeenCalled();
  });

  it("reports taken when a booking landed on the doctor after the free check", async () => {
    const deps = ports({ result: "taken" });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("taken");
  });

  it("reports not found when the booking is gone", async () => {
    const deps = ports({ found: null });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("not_found");
    expect(deps.reassign).not.toHaveBeenCalled();
  });

  it("reports not found when the booking is no longer booked", async () => {
    const deps = ports({ found: booking({ status: "cancelled" }) });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("not_found");
    expect(deps.reassign).not.toHaveBeenCalled();
  });

  it("reports not found when the booking has already started", async () => {
    const deps = ports({ found: booking({ startsAt: new Date("2026-10-05T04:00:00Z") }) });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("not_found");
    expect(deps.reassign).not.toHaveBeenCalled();
  });

  it("reports not found when the database refuses the move itself", async () => {
    const deps = ports({ result: "not_found" });
    await expect(runReassignCommand(command, NOW, deps)).resolves.toBe("not_found");
  });
});
