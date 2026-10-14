import { OPTIONAL_PAGE_TABS, RENAMABLE_PAGE_TABS, checkPageTabLabel, type OptionalPageTab, type RenamablePageTab } from "@fynix/shared/lib/directory/page-tabs";
import { cleanLine } from "@fynix/shared/lib/validation/text";
import {
  CONTACT_OPTIONS,
  LICENCE_MAX_LENGTH,
  LICENCES_MAX,
  PAYMENT_METHODS,
  type ContactOption,
  type PaymentMethod,
} from "@/lib/business-profile-fields";
import { OWNER_FORM_FIELDS_MESSAGE, ownerFormCheck } from "@/lib/owner-form";

/*
 * The Contact options tab (the sheet's "Customer Conversion"), the Trust tab ("Trust & Business Information") and the
 * Page tabs tab: which buttons visitors get, how the business takes payment, its licences, and which optional tabs its page shows. Browser-safe and pure.
 */

const isContactForm = ownerFormCheck(["option"]);
const isPageTabsForm = ownerFormCheck(["tab", ...RENAMABLE_PAGE_TABS.map(pageTabLabelField)]);
const isTrustForm = ownerFormCheck(["payment", "licences"]);

export type SimpleParseResult<T> = { readonly success: true; readonly data: T } | { readonly success: false; readonly message: string };

/** Every value posted under `key`, each of which must be one of `allowed`, kept once and in `allowed`'s order. */
function readChoices<T extends string>(formData: FormData, key: string, allowed: readonly T[]): readonly T[] | null {
  const posted = formData.getAll(key);
  const chosen = new Set<string>();
  for (const value of posted) {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) return null;
    chosen.add(value);
  }
  return allowed.filter((option) => chosen.has(option));
}

export function parseContactOptionsForm(formData: FormData): SimpleParseResult<readonly ContactOption[]> {
  if (!isContactForm(formData)) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  const options = readChoices(formData, "option", CONTACT_OPTIONS);
  if (options === null) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  return { success: true, data: options };
}

/** The name of the form field that holds the owner's word for a renamable tab ("label-services"). */
export function pageTabLabelField(tab: RenamablePageTab): string {
  return `label-${tab}`;
}

/** What the Page tabs tab saves: the tabs the page shows, and the owner's own word for each renamable one (null: the usual word). */
export interface PageTabsInput {
  readonly tabs: readonly OptionalPageTab[];
  readonly labels: Readonly<Record<RenamablePageTab, string | null>>;
}

/**
 * The Page tabs tab: which optional tabs the business's page shows (none ticked is a valid choice), and what the owner calls
 * Services and Products (blank keeps the usual word).
 */
export function parsePageTabsForm(formData: FormData): SimpleParseResult<PageTabsInput> {
  if (!isPageTabsForm(formData)) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  const tabs = readChoices(formData, "tab", OPTIONAL_PAGE_TABS);
  if (tabs === null) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  const labels: Record<RenamablePageTab, string | null> = { services: null, products: null };
  for (const tab of RENAMABLE_PAGE_TABS) {
    const typed = formData.get(pageTabLabelField(tab));
    const checked = checkPageTabLabel(typeof typed === "string" ? typed : "");
    if (!checked.ok) return { success: false, message: checked.message };
    labels[tab] = checked.label;
  }
  return { success: true, data: { tabs, labels } };
}

export interface TrustInput {
  readonly paymentMethods: readonly PaymentMethod[];
  /** One licence or certification per entry, trimmed, blank lines dropped. */
  readonly licences: readonly string[];
}

export function parseTrustForm(formData: FormData): SimpleParseResult<TrustInput> {
  if (!isTrustForm(formData)) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };
  const paymentMethods = readChoices(formData, "payment", PAYMENT_METHODS);
  if (paymentMethods === null) return { success: false, message: OWNER_FORM_FIELDS_MESSAGE };

  const typed = formData.get("licences");
  const lines = (typeof typed === "string" ? typed : "")
    .split(/\r\n?|\n/)
    .map((line) => cleanLine(line).replace(/\s+/g, " "))
    .filter((line) => line !== "");
  if (lines.length > LICENCES_MAX) return { success: false, message: `List at most ${String(LICENCES_MAX)} licences or certifications.` };
  if (lines.some((line) => line.length > LICENCE_MAX_LENGTH)) {
    return { success: false, message: `Keep each licence to ${String(LICENCE_MAX_LENGTH)} characters.` };
  }
  return { success: true, data: { paymentMethods, licences: [...new Set(lines)] } };
}
