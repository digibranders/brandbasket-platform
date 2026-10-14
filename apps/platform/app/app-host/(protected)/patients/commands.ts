/** The patient register's commands, pure and independent of the database and of `"use server"`: each run function
 * takes its reads and writes as ports over the caller's one tenant-scoped transaction (actions.ts binds them to it,
 * the tests to plain fakes), and each outcome maps to the form problem the customer sees, or to none on success.
 * Parsing the forms themselves is @fynix/shared's patients/patient-form.ts. */
import type { ErasePatientResult, MergePatientsResult, PatientEdit, PatientRow, UpdatePatientResult } from "@fynix/db";
import { ALT_PHONE_FIELD, PATIENT_PHONE_FIELD } from "@fynix/shared/lib/patients/fields";
import type { MergeLookupCommand, PatientEditCommand } from "@fynix/shared/lib/patients/patient-form";
import type { PanelFormProblem } from "@/lib/panel-form-state";
import {
  HAS_UPCOMING_MESSAGE,
  MERGE_SAME_MESSAGE,
  NO_MATCH_MESSAGE,
  OWN_PHONE_MESSAGE,
  PATIENT_GONE_MESSAGE,
  PHONE_IN_USE_MESSAGE,
  SAME_PATIENT_MESSAGE,
} from "./errors";

// ---------------------------------------------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------------------------------------------

/** updatePatient's outcomes, plus this command's own: the second phone typed is the patient's own main number. */
export type PatientEditOutcome = UpdatePatientResult | "own_phone";

export interface PatientEditPorts {
  readonly findPatient: (patientId: string) => Promise<PatientRow | null>;
  readonly updatePatient: (patientId: string, edit: PatientEdit) => Promise<UpdatePatientResult>;
}

/**
 * Saves the Edit form. updatePatient refuses a second phone equal to the patient's own number with the same
 * `phone_in_use` it gives for another patient's number, which would tell the clinic the wrong thing ("belongs to
 * another patient"), so the patient is read first and that one case is told apart here. The main number never
 * changes (the link trigger finds patients by it), so this early read cannot go stale in a way that matters; every
 * other check still runs under updatePatient's booking lock.
 */
export async function runPatientEditCommand(command: PatientEditCommand, ports: PatientEditPorts): Promise<PatientEditOutcome> {
  const patient = await ports.findPatient(command.patientId);
  if (patient === null) return "not_found";
  if (command.altPhone !== null && command.altPhone === patient.phone) return "own_phone";
  return ports.updatePatient(patient.id, { name: command.name, altPhone: command.altPhone, tags: command.tags });
}

/** What the Edit form shows for an outcome: null once saved; the phone refusals point at the second phone. */
export function editOutcomeProblem(outcome: PatientEditOutcome): PanelFormProblem | null {
  switch (outcome) {
    case "updated":
      return null;
    case "not_found":
      return { message: PATIENT_GONE_MESSAGE, field: null };
    case "phone_in_use":
      return { message: PHONE_IN_USE_MESSAGE, field: ALT_PHONE_FIELD };
    case "own_phone":
      return { message: OWN_PHONE_MESSAGE, field: ALT_PHONE_FIELD };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------------------------

/** Merge, step one: the other record was `found` (its id goes to the confirm step), or the lookup was refused. */
export type MergeLookupOutcome =
  | { readonly kind: "found"; readonly removeId: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "no_match" }
  | { readonly kind: "same" };

export interface MergeLookupPorts {
  readonly findPatient: (patientId: string) => Promise<PatientRow | null>;
  readonly findPatientByPhone: (phone: string) => Promise<PatientRow | null>;
}

/**
 * Finds the record a merge would fold into `keepId`, by the phone typed: the same phone-or-second-phone rule the
 * link trigger books by, so this is the record a booking from that number would have joined. Nothing is written;
 * the confirm step re-checks both records under mergePatients' lock.
 */
export async function runMergeLookupCommand(command: MergeLookupCommand, ports: MergeLookupPorts): Promise<MergeLookupOutcome> {
  const keep = await ports.findPatient(command.keepId);
  if (keep === null) return { kind: "not_found" };
  const other = await ports.findPatientByPhone(command.phone);
  if (other === null) return { kind: "no_match" };
  if (other.id === keep.id) return { kind: "same" };
  return { kind: "found", removeId: other.id };
}

/** What the lookup form shows when no other record was found; a found one moves on to the confirm step instead. */
export function mergeLookupProblem(outcome: Exclude<MergeLookupOutcome, { readonly kind: "found" }>): PanelFormProblem {
  switch (outcome.kind) {
    case "not_found":
      return { message: PATIENT_GONE_MESSAGE, field: null };
    case "no_match":
      return { message: NO_MATCH_MESSAGE, field: PATIENT_PHONE_FIELD };
    case "same":
      return { message: SAME_PATIENT_MESSAGE, field: PATIENT_PHONE_FIELD };
  }
}

/** What the confirm step shows for mergePatients' outcome: null once merged. */
export function mergeOutcomeProblem(outcome: MergePatientsResult): PanelFormProblem | null {
  switch (outcome) {
    case "merged":
      return null;
    case "not_found":
      return { message: PATIENT_GONE_MESSAGE, field: null };
    case "same":
      return { message: MERGE_SAME_MESSAGE, field: null };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------------------------------------------

/** What the delete confirm shows for erasePatient's outcome: null once erased. */
export function eraseOutcomeProblem(outcome: ErasePatientResult): PanelFormProblem | null {
  switch (outcome) {
    case "erased":
      return null;
    case "not_found":
      return { message: PATIENT_GONE_MESSAGE, field: null };
    case "has_upcoming":
      return { message: HAS_UPCOMING_MESSAGE, field: null };
  }
}
