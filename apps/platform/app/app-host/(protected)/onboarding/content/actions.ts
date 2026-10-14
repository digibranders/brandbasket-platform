"use server";

import { DuplicateServiceIdError, replaceServices, saveProjectBrief, ServiceNotFoundError } from "@firstfold/db";
import { redirect } from "next/navigation";
import { parseContentForm } from "@/lib/onboarding/content-form";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { hrefAfter } from "@firstfold/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { saveOnboardingStep, type StepProblem } from "@/lib/server/onboarding";

/**
 * A service id the business does not have (removed in another tab, or never theirs) is refused by the save; the
 * page is simply out of date, so the customer is asked to reload rather than shown an error page.
 */
function describeServiceError(error: unknown): StepProblem | null {
  if (error instanceof ServiceNotFoundError || error instanceof DuplicateServiceIdError) {
    return {
      message: "Your list of services has changed since this page loaded. Reload the page and try again.",
      field: null,
    };
  }
  return null;
}

/** Step 02: saves the services and the brief together, marks the step done and moves on. */
export async function saveContentStep(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();

  const parsed = parseContentForm(formData);
  if (!parsed.success) return refusedStepState(parsed, formData);
  const { services, notesForBuilder, styleLikes, referenceUrls } = parsed.data;

  const problem = await saveOnboardingStep(
    getAppDb(),
    tenant,
    "content",
    async (tx, project) => {
      await replaceServices(tx, services);
      await saveProjectBrief(tx, project.id, { notesForBuilder, styleLikes, referenceUrls });
      return null;
    },
    describeServiceError,
  );
  if (problem !== null) return refusedStepState(problem, formData);

  redirect(hrefAfter("content"));
}
