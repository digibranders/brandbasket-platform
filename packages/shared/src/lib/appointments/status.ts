/** The lifecycle of one booked appointment, and the actions the clinic dashboard can take on it. Replaces the old
 * request-inbox model (new/confirmed/suggested/declined, preferred windows, new/upcoming/past groups): a booking
 * is created straight into "booked" (the patient already picked and confirmed an exact slot by OTP), so there is
 * nothing left to confirm, suggest or decline before it happens. */
export const APPOINTMENT_STATUSES = ["booked", "cancelled", "done", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  booked: "Booked",
  cancelled: "Cancelled",
  done: "Attended",
  no_show: "No-show",
};

/** `done` is shown as "Attended" and `no_show` as "No-show": the two outcomes of a booking whose slot has started. */
export const APPOINTMENT_ACTIONS = ["cancel", "done", "no_show"] as const;
export type AppointmentAction = (typeof APPOINTMENT_ACTIONS)[number];

/** One of an action's possible outcomes: starting from any status in `from`, it lands on `to`. */
export interface AppointmentTransition {
  readonly from: readonly AppointmentStatus[];
  readonly to: AppointmentStatus;
}

/**
 * Every outcome each action can produce. packages/db cannot import @brandbasket/shared (the dependency points the
 * other way), so its own copy (queries/appointments.ts's `APPOINTMENT_TRANSITIONS`, which the conditional `UPDATE`
 * builds its guarded statement from) writes this table out literally rather than importing it from here;
 * status-db-parity.test.ts is the tripwire that keeps the two copies from drifting apart.
 */
export const ACTION_TRANSITIONS: Readonly<Record<AppointmentAction, readonly AppointmentTransition[]>> = {
  cancel: [{ from: ["booked"], to: "cancelled" }],
  done: [{ from: ["booked"], to: "done" }],
  no_show: [{ from: ["booked"], to: "no_show" }],
};

function allowedFrom(transitions: readonly AppointmentTransition[]): readonly AppointmentStatus[] {
  return transitions.flatMap((transition) => transition.from);
}

/** Which statuses each action may start from, derived from ACTION_TRANSITIONS. */
export const ACTION_ALLOWED_FROM: Readonly<Record<AppointmentAction, readonly AppointmentStatus[]>> = {
  cancel: allowedFrom(ACTION_TRANSITIONS.cancel),
  done: allowedFrom(ACTION_TRANSITIONS.done),
  no_show: allowedFrom(ACTION_TRANSITIONS.no_show),
};

/** The status `action` leaves a booking in, or null when the action is not allowed from `from`. */
export function statusAfter(action: AppointmentAction, from: AppointmentStatus): AppointmentStatus | null {
  const transition = ACTION_TRANSITIONS[action].find((candidate) => candidate.from.includes(from));
  return transition === undefined ? null : transition.to;
}

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function isAppointmentAction(value: string): value is AppointmentAction {
  return (APPOINTMENT_ACTIONS as readonly string[]).includes(value);
}
