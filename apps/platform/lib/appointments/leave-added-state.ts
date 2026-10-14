/**
 * What the Doctors page's "add leave" form hands back once the leave is saved: the usual `saved` panel state, plus
 * the bookings that fall on the new leave. Leave still saves over existing bookings -- nothing is cancelled
 * automatically -- so the form lists them straight away for reception to reassign or cancel. Kept here, apart from
 * doctors/actions.ts ("use server": async exports only) and doctors/commands.ts (server-only through
 * parseHoursForm), because the client form reads it too.
 *
 * It is still a PanelFormState -- `{ status: "saved" }` with one extra field -- so it flows through usePanelForm
 * and PanelFormStatus unchanged; `leaveClashesOf` is how the client reads the extra field back out.
 */
import type { PanelFormState } from "@/lib/panel-form-state";

/** One booking that falls on newly added leave. Plain strings only, so it crosses from the server action to the
 * client form state unchanged. */
export interface LeaveClash {
  readonly appointmentId: string;
  readonly patientName: string;
  /** "YYYY-MM-DD", the clinic's own calendar date. */
  readonly localDate: string;
  /** "HH:MM". */
  readonly localStart: string;
  readonly localEnd: string;
}

export interface LeaveAddedState {
  readonly status: "saved";
  readonly clashes: readonly LeaveClash[];
}

export function leaveAddedState(clashes: readonly LeaveClash[]): LeaveAddedState {
  return { status: "saved", clashes };
}

/** The clashes a saved add-leave state carries, or an empty list for any other state (idle, an error, or a plain
 * `saved` from some other form). */
export function leaveClashesOf(state: PanelFormState): readonly LeaveClash[] {
  if (state.status !== "saved" || !("clashes" in state)) return [];
  const clashes: unknown = state.clashes;
  return Array.isArray(clashes) ? (clashes as readonly LeaveClash[]) : [];
}
