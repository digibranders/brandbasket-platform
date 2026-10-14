/**
 * Failures specific to the Listing page. The generic pieces (paymentRequiredState, unexpectedErrorState) live in
 * lib/server/panel-form-errors.ts; this file keeps only what is particular to the listing.
 */
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const LISTING_MISSING_MESSAGE = "Your listing isn't set up yet. We'll let you know when it is.";

/** The business has no listing row: staff have not created it, so there is nothing to save into. */
export function listingMissingState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: LISTING_MISSING_MESSAGE, field: null }, formData);
}
