/**
 * packages/db cannot import @firstfold/shared (the dependency points the other way: shared depends on db), so its
 * schema/appointments.ts and queries/appointments.ts write out the enum values and the transition table literally
 * rather than importing them from here. This test is the tripwire: it asserts the two copies still agree, so a
 * later edit to one side that forgets the other fails loudly instead of silently drifting.
 */
import { appointmentStatus, businessModule, APPOINTMENT_TRANSITIONS as DB_APPOINTMENT_TRANSITIONS } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { BUSINESS_MODULES } from "../business-modules";
import { ACTION_TRANSITIONS, APPOINTMENT_STATUSES } from "./status";

describe("shared/db parity", () => {
  it("agrees on the appointment status enum values", () => {
    expect([...APPOINTMENT_STATUSES]).toEqual([...appointmentStatus.enumValues]);
  });

  it("agrees on the business module enum values", () => {
    expect([...BUSINESS_MODULES]).toEqual([...businessModule.enumValues]);
  });

  it("agrees on every action's allowed transitions", () => {
    expect(DB_APPOINTMENT_TRANSITIONS).toEqual(ACTION_TRANSITIONS);
  });
});
