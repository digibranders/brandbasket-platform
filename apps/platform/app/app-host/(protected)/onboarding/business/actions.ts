"use server";

import { replaceBusinessHours, saveBusinessProfile } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBusinessForm } from "@/lib/onboarding/business-form";
import { toStoredHours } from "@brandbasket/shared/lib/onboarding/hours";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { hrefAfter } from "@brandbasket/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { saveOnboardingStep } from "@/lib/server/onboarding";

/** Step 01: saves the profile and the opening hours together, marks the step done and moves on. */
export async function saveBusinessStep(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();

  const parsed = parseBusinessForm(formData);
  if (!parsed.success) return refusedStepState(parsed, formData);
  const { profile, hours } = parsed.data;

  const problem = await saveOnboardingStep(getAppDb(), tenant, "business", async (tx) => {
    await saveBusinessProfile(tx, profile);
    // A day left "Not set" has no entry, so it is saved as no row at all.
    await replaceBusinessHours(tx, hours.map(toStoredHours));
    return null;
  });
  if (problem !== null) return refusedStepState(problem, formData);

  // The step list in the layout reads what is done, so it must be read again or this step stays unticked.
  revalidatePath("/onboarding", "layout");
  redirect(hrefAfter("business"));
}
