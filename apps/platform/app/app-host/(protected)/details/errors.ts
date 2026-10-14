/**
 * Failures specific to the "Your details" page. The generic pieces -- isCheckViolation, paymentRequiredState,
 * unexpectedErrorState -- live in lib/server/panel-form-errors.ts now that Appointments needs them too (and
 * errorLogInfo in @fynix/shared/server/error-log-info, shared more widely still); this file keeps only what's particular to
 * hours, closures and the announcement.
 */
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const CLOSURE_NOT_FOUND_MESSAGE = "That closure could not be found. Reload the page.";
export const CLOSURE_PAST_MESSAGE = "Choose dates from today onwards.";

/** `closureId` was either not a UUID, or named no row of this business's — the same message either way, so it
 * never reveals which. */
export function closureNotFoundState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: CLOSURE_NOT_FOUND_MESSAGE, field: null }, formData);
}

/** A closure whose last day has already passed in the business's own time zone. */
export function closureInPastState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: CLOSURE_PAST_MESSAGE, field: "endsOn" }, formData);
}
