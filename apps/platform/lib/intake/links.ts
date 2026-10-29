import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { MEMBERSHIP_SERVICES_PARAM } from "@/lib/membership";

export const PERSONALIZE_PATH = "/personalize";

/** The step parameter: a question's field name, or this for the summary. */
export const INTAKE_STEP_PARAM = "q";
export const INTAKE_SUMMARY_STEP = "summary";

/** The questions' page opened on a basket and a step (a question's field, or the summary). With no step it opens where the customer left off. */
export function personalizeHref(services: readonly MonthlyAddOnId[], step?: string): string {
  const params = new URLSearchParams({ [MEMBERSHIP_SERVICES_PARAM]: services.join(",") });
  if (step !== undefined) params.set(INTAKE_STEP_PARAM, step);
  return `${PERSONALIZE_PATH}?${params.toString().replaceAll("%2C", ",")}`;
}
