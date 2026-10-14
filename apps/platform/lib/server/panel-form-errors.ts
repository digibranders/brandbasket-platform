/**
 * Turns a raw failure into a `PanelFormState`, kept apart from any one feature's actions.ts so this mapping can be
 * unit-tested without mocking the database or billing. Nothing here does I/O -- no logging, no queries -- so every
 * function is a plain, deterministic function of its inputs. Logging the raw error is each action's own job (see
 * `errorLogInfo` in `@firstfold/shared/server/error-log-info`, which only extracts what's safe to write to the log, and doesn't write anything
 * itself).
 *
 * Shared by every panel-form feature (today: "Your details" and Appointments) -- started as details/errors.ts,
 * moved here once Appointments needed the same generic pieces, so neither feature depends on the other's page.
 * Each feature keeps only its own messages and states (e.g. details/errors.ts's closure ones,
 * appointments/errors.ts's module-off and schedule ones) alongside this.
 */
import { CHECK_VIOLATION, hasPostgresCode } from "@firstfold/db";
import { PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";
export const CHECK_VIOLATION_MESSAGE = "That doesn't fit the limits for this field. Check it and try again.";

/** True when a Postgres check-constraint failure is anywhere along the error's cause chain -- a value that
 * slipped past this form's own validation but still failed the database's. */
export function isCheckViolation(error: unknown): boolean {
  return hasPostgresCode(error, CHECK_VIOLATION);
}

/** What every action on a panel-form page answers when the business hasn't paid yet. */
export function paymentRequiredState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: PAID_PLAN_REQUIRED_MESSAGE, field: null }, formData);
}

/** Every action's catch-all: a check-constraint failure gets a friendlier message than an unexplained one. */
export function unexpectedErrorState(error: unknown, formData: FormData): PanelFormState {
  return panelFormErrorState(
    { message: isCheckViolation(error) ? CHECK_VIOLATION_MESSAGE : GENERIC_ERROR_MESSAGE, field: null },
    formData,
  );
}
