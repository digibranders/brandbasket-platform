import { slugifyBusinessName } from "@fynix/shared/lib/directory/places";
import { cleanLine } from "@fynix/shared/lib/validation/text";
import { JOIN_BUSINESS_NAME_MAX_LENGTH } from "@/lib/join-form";

/*
 * A free listing's name and address as its owner types them on the Business profile (docs/superpowers/specs/
 * 2026-10-01-business-profile-design.md). Browser-safe, so the form shares the limits.
 */

/** The longest address the directory keeps (directory_claims_street_address_check). */
export const BUSINESS_ADDRESS_MAX_LENGTH = 200;

export type BusinessNameResult =
  | { readonly success: true; readonly businessName: string; readonly slug: string }
  | { readonly success: false; readonly message: string };

/**
 * The form's `businessName` as one clean line, and as the slug it makes for a web address; a name with no letters or
 * digits makes none and is refused.
 */
export function readBusinessName(formData: FormData): BusinessNameResult {
  const typed = formData.get("businessName");
  const businessName = cleanLine(typeof typed === "string" ? typed : "").replace(/\s+/g, " ");
  if (businessName === "") return { success: false, message: "Enter your business's name." };
  if (businessName.length > JOIN_BUSINESS_NAME_MAX_LENGTH) return { success: false, message: "That business name is too long." };
  const slug = slugifyBusinessName(businessName);
  if (slug === "") return { success: false, message: "Use letters or numbers in your business's name." };
  return { success: true, businessName, slug };
}
