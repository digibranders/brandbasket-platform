import type { PatientRow, UpdatePatientResult } from "@fynix/db";
import { describe, expect, it, vi } from "vitest";
import {
  editOutcomeProblem,
  eraseOutcomeProblem,
  mergeLookupProblem,
  mergeOutcomeProblem,
  runMergeLookupCommand,
  runPatientEditCommand,
  type MergeLookupPorts,
  type PatientEditPorts,
} from "./commands";
import {
  HAS_UPCOMING_MESSAGE,
  MERGE_SAME_MESSAGE,
  NO_MATCH_MESSAGE,
  OWN_PHONE_MESSAGE,
  PATIENT_GONE_MESSAGE,
  PHONE_IN_USE_MESSAGE,
  SAME_PATIENT_MESSAGE,
} from "./errors";

const ARJUN_ID = "0192f3c4-4444-7000-8000-000000000001";
const MEERA_ID = "0192f3c4-4444-7000-8000-000000000002";

function patient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: ARJUN_ID,
    name: "Arjun Menon",
    phone: "+919876543210",
    altPhone: null,
    tags: [],
    createdAt: new Date("2026-03-01T04:30:00Z"),
    updatedAt: new Date("2026-03-01T04:30:00Z"),
    ...overrides,
  };
}

function editPorts(found: PatientRow | null, result: UpdatePatientResult = "updated"): PatientEditPorts {
  return { findPatient: vi.fn().mockResolvedValue(found), updatePatient: vi.fn().mockResolvedValue(result) };
}

describe("runPatientEditCommand", () => {
  const command = { patientId: ARJUN_ID, name: "Arjun M", altPhone: "+919820011223", tags: ["VIP"] } as const;

  it("saves the name, second phone and tags", async () => {
    const ports = editPorts(patient());
    await expect(runPatientEditCommand(command, ports)).resolves.toBe("updated");
    expect(ports.updatePatient).toHaveBeenCalledWith(ARJUN_ID, { name: "Arjun M", altPhone: "+919820011223", tags: ["VIP"] });
  });

  it("is not_found without writing when the patient is gone", async () => {
    const ports = editPorts(null);
    await expect(runPatientEditCommand(command, ports)).resolves.toBe("not_found");
    expect(ports.updatePatient).not.toHaveBeenCalled();
  });

  it("refuses the patient's own main number as their second, without writing", async () => {
    const ports = editPorts(patient({ phone: "+919820011223" }));
    await expect(runPatientEditCommand(command, ports)).resolves.toBe("own_phone");
    expect(ports.updatePatient).not.toHaveBeenCalled();
  });

  it("clears the second phone", async () => {
    const ports = editPorts(patient({ altPhone: "+919820011223" }));
    await expect(runPatientEditCommand({ ...command, altPhone: null }, ports)).resolves.toBe("updated");
    expect(ports.updatePatient).toHaveBeenCalledWith(ARJUN_ID, { name: "Arjun M", altPhone: null, tags: ["VIP"] });
  });

  it("passes updatePatient's own refusal through", async () => {
    const ports = editPorts(patient(), "phone_in_use");
    await expect(runPatientEditCommand(command, ports)).resolves.toBe("phone_in_use");
  });
});

describe("editOutcomeProblem", () => {
  it("is nothing once saved", () => {
    expect(editOutcomeProblem("updated")).toBeNull();
  });

  it("points both phone refusals at the second phone, each with its own words", () => {
    expect(editOutcomeProblem("phone_in_use")).toEqual({ message: PHONE_IN_USE_MESSAGE, field: "altPhone" });
    expect(editOutcomeProblem("own_phone")).toEqual({ message: OWN_PHONE_MESSAGE, field: "altPhone" });
  });

  it("says the patient is gone for not_found", () => {
    expect(editOutcomeProblem("not_found")).toEqual({ message: PATIENT_GONE_MESSAGE, field: null });
  });
});

function lookupPorts(keep: PatientRow | null, byPhone: PatientRow | null): MergeLookupPorts {
  return { findPatient: vi.fn().mockResolvedValue(keep), findPatientByPhone: vi.fn().mockResolvedValue(byPhone) };
}

describe("runMergeLookupCommand", () => {
  const command = { keepId: ARJUN_ID, phone: "+919820011223" } as const;

  it("finds the other record by its phone", async () => {
    const ports = lookupPorts(patient(), patient({ id: MEERA_ID, name: "Meera", phone: "+919820011223" }));
    await expect(runMergeLookupCommand(command, ports)).resolves.toEqual({ kind: "found", removeId: MEERA_ID });
    expect(ports.findPatientByPhone).toHaveBeenCalledWith("+919820011223");
  });

  it("is not_found when the kept patient is gone, before looking anyone up", async () => {
    const ports = lookupPorts(null, patient({ id: MEERA_ID }));
    await expect(runMergeLookupCommand(command, ports)).resolves.toEqual({ kind: "not_found" });
    expect(ports.findPatientByPhone).not.toHaveBeenCalled();
  });

  it("is no_match when no patient has the number", async () => {
    await expect(runMergeLookupCommand(command, lookupPorts(patient(), null))).resolves.toEqual({ kind: "no_match" });
  });

  it("is same when the number leads back to this patient", async () => {
    await expect(runMergeLookupCommand(command, lookupPorts(patient(), patient()))).resolves.toEqual({ kind: "same" });
  });
});

describe("mergeLookupProblem", () => {
  it("points a missing or own number at the phone input", () => {
    expect(mergeLookupProblem({ kind: "no_match" })).toEqual({ message: NO_MATCH_MESSAGE, field: "phone" });
    expect(mergeLookupProblem({ kind: "same" })).toEqual({ message: SAME_PATIENT_MESSAGE, field: "phone" });
  });

  it("says the patient is gone for not_found", () => {
    expect(mergeLookupProblem({ kind: "not_found" })).toEqual({ message: PATIENT_GONE_MESSAGE, field: null });
  });
});

describe("mergeOutcomeProblem", () => {
  it("maps each of mergePatients' outcomes", () => {
    expect(mergeOutcomeProblem("merged")).toBeNull();
    expect(mergeOutcomeProblem("not_found")).toEqual({ message: PATIENT_GONE_MESSAGE, field: null });
    expect(mergeOutcomeProblem("same")).toEqual({ message: MERGE_SAME_MESSAGE, field: null });
  });
});

describe("eraseOutcomeProblem", () => {
  it("maps each of erasePatient's outcomes", () => {
    expect(eraseOutcomeProblem("erased")).toBeNull();
    expect(eraseOutcomeProblem("not_found")).toEqual({ message: PATIENT_GONE_MESSAGE, field: null });
    expect(eraseOutcomeProblem("has_upcoming")).toEqual({ message: HAS_UPCOMING_MESSAGE, field: null });
  });

  it("asks the clinic to cancel the upcoming booking first", () => {
    expect(HAS_UPCOMING_MESSAGE).toBe("Cancel their upcoming booking first.");
  });
});
