import { BUSINESS_EXTRA_CATEGORIES_MAX } from "@brandbasket/db";
import { isDirectoryCategory } from "@brandbasket/shared/lib/directory/places";
import { categoryOptions, type PickOption } from "@/lib/listing-address";
import { OWNER_FORM_FIELDS_MESSAGE, ownerFormCheck } from "@/lib/owner-form";

/*
 * The Listing tab's "Also list me in": the categories, besides its main one, a business also shows under. Server-side
 * and pure; whether one of them is the business's own main category is checked on the server, which knows it.
 */

const isExtraCategoriesForm = ownerFormCheck(["category"]);

export type ExtraCategoriesParseResult =
  | { readonly success: true; readonly data: readonly string[] }
  | { readonly success: false; readonly message: string };

/** Every category A to Z that the business could also list in: all but its main one. */
export function extraCategoryOptions(mainCategorySlug: string): readonly PickOption[] {
  return categoryOptions().filter((option) => option.value !== mainCategorySlug);
}

export function parseExtraCategoriesForm(formData: FormData): ExtraCategoriesParseResult {
  if (!isExtraCategoriesForm(formData)) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  const chosen = new Set<string>();
  for (const value of formData.getAll("category")) {
    if (typeof value !== "string" || !isDirectoryCategory(value)) return { success: false, message: "Choose categories from the list." };
    chosen.add(value);
  }
  if (chosen.size > BUSINESS_EXTRA_CATEGORIES_MAX) {
    return { success: false, message: `List in at most ${String(BUSINESS_EXTRA_CATEGORIES_MAX)} extra categories.` };
  }
  return { success: true, data: [...chosen] };
}
