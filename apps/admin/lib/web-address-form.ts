/*
 * The staff "Change web address" form (Task 9 of docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md):
 * the name part and city of a live business's URL, /in/mh/<city>/business/<name>/<id>, and why it changes. Browser-safe,
 * shared by the form (components/web-address.tsx) and its server side (lib/server/web-address.ts).
 */

export const WEB_ADDRESS_FIELDS = ["urlSlug", "citySlug", "reason"] as const;
export type WebAddressField = (typeof WEB_ADDRESS_FIELDS)[number];

/** What staff typed, kept so a refused form shows it again. */
export interface WebAddressValues {
  readonly urlSlug: string;
  readonly citySlug: string;
  readonly reason: string;
}

export type WebAddressFormState =
  | { readonly status: "idle" }
  /** `field` is null for a refusal about the business rather than one box (not live yet, or gone). */
  | { readonly status: "error"; readonly field: WebAddressField | null; readonly message: string; readonly values: WebAddressValues }
  /** `url` is the business's full new address. */
  | { readonly status: "changed"; readonly url: string };

export const INITIAL_WEB_ADDRESS_STATE: WebAddressFormState = { status: "idle" };

export const WEB_ADDRESS_MESSAGES = {
  urlSlug: "Use lowercase letters, digits and single hyphens, up to 70 characters.",
  citySlug: "Choose a city from the list.",
  otherState: "This business is outside Thane: its PIN code sets its city, so only its name can change here.",
  reason: "Say why, in 3 to 300 characters.",
  same: "That is already its web address.",
  notLive: "Its page isn't live yet, so its owner can still change it.",
  unknown: "We couldn't find this business. Reload the page.",
} as const;

export function webAddressValuesFrom(read: (name: WebAddressField) => FormDataEntryValue | null): WebAddressValues {
  const text = (name: WebAddressField): string => {
    const value = read(name);
    return typeof value === "string" ? value : "";
  };
  return { urlSlug: text("urlSlug"), citySlug: text("citySlug"), reason: text("reason") };
}
