"use server";

import { listMediaAssets, updateMediaAltText } from "@firstfold/db";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseBrandForm } from "@/lib/onboarding/brand-form";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { hrefAfter } from "@firstfold/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { getMediaStorage } from "@firstfold/shared/server/media-storage";
import { saveOnboardingStep } from "@/lib/server/onboarding";
import { removeOnboardingImage, type MediaActionResult } from "@/lib/server/onboarding-media";

/** Removes one logo or photo. Uploads go to the /api/uploads route handler instead, to keep actions' 1 MB body limit. */
export async function removeBrandImage(mediaId: string): Promise<MediaActionResult> {
  const { tenant } = await requireCustomerAccess();
  if (typeof mediaId !== "string") return { ok: false, message: "Reload the page and try again." };

  const result = await removeOnboardingImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, mediaId);
  refresh();
  return result;
}

/**
 * Step 03: saves a description for every photo, marks the step done and moves on. The photos are read inside the
 * transaction, so the descriptions are checked against what is really stored, not against what the page showed.
 */
export async function saveBrandStep(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();

  const problem = await saveOnboardingStep(getAppDb(), tenant, "brand", async (tx) => {
    const photos = await listMediaAssets(tx, "photo");
    const logos = await listMediaAssets(tx, "logo");
    const parsed = parseBrandForm(formData, { photoIds: photos.map((photo) => photo.id), logoCount: logos.length });
    if (!parsed.success) return { message: parsed.message, field: parsed.field };

    for (const { mediaId, altText } of parsed.data.descriptions) {
      await updateMediaAltText(tx, mediaId, altText);
    }
    return null;
  });
  if (problem !== null) return refusedStepState(problem, formData);

  redirect(hrefAfter("brand"));
}
