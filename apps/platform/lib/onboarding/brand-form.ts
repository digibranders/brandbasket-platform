import { z } from "zod";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { textField, type StepParseResult } from "@brandbasket/shared/lib/onboarding/form-result";

export const MAX_PHOTOS = 20;
export const MAX_DESCRIPTION_LENGTH = 250;

export interface BrandFormContext {
  /** The business's saved photos, in the order the page shows them. The server reads these, never the form. */
  readonly photoIds: readonly string[];
  readonly logoCount: number;
}

export interface PhotoDescription {
  readonly mediaId: string;
  readonly altText: string;
}

export interface BrandStepInput {
  readonly descriptions: readonly PhotoDescription[];
}

/** The form field holding a photo's description. */
export function photoDescriptionField(mediaId: string): string {
  return `photos.${mediaId}.alt`;
}

const description = z
  .string()
  .transform(cleanLine)
  .pipe(
    z
      .string()
      .min(1, "Describe this photo for people who can't see it.")
      .max(MAX_DESCRIPTION_LENGTH, `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters.`),
  );

/**
 * Step 03. The uploads themselves are saved as they happen; completing the step saves a description for every
 * saved photo, and needs at least one image. Descriptions for ids that are not in `photoIds` are ignored, so a
 * form cannot touch an image the business does not have.
 */
export function parseBrandForm(formData: FormData, context: BrandFormContext): StepParseResult<BrandStepInput> {
  if (context.photoIds.length === 0 && context.logoCount === 0) {
    return { success: false, message: "Add your logo or at least one photo.", field: null };
  }

  const descriptions: PhotoDescription[] = [];
  for (const mediaId of context.photoIds) {
    const field = photoDescriptionField(mediaId);
    const result = description.safeParse(textField(formData, field));
    if (!result.success) {
      return { success: false, message: result.error.issues[0]?.message ?? "Check this description.", field };
    }
    descriptions.push({ mediaId, altText: result.data });
  }
  return { success: true, data: { descriptions } };
}
