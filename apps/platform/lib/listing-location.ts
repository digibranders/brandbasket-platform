import type { PincodeRecord } from "@brandbasket/db";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import { isOpenedDistrict } from "@brandbasket/shared/lib/directory/opened-districts";
import type { PickOption } from "@/lib/listing-address";

/*
 * Where a business is listed, from its PIN code. A district we have opened (Thane so far) has the directory's own
 * areas, category pages and ads, so the owner picks an area there as before. Anywhere else the business gets its own
 * page only, under its state (/in/<state>/business/<name>/<code>), and the owner picks the post-office locality its
 * PIN covers. Its listing key is then <category>/<state>-<district>/<locality>/<name>: the four-part shape the database
 * checks, with a city part no Thane town can have, so the two kinds never share an address. Which districts are opened
 * lives in @brandbasket/db (opened-districts), where the claim writes check every listing against it. Pure and
 * browser-safe.
 */

export { elsewhereCitySlug, isOpenedDistrict, OPENED_DISTRICTS } from "@brandbasket/shared/lib/directory/opened-districts";

/** An Indian PIN code: six digits, never starting with 0. */
export const PIN_CODE_PATTERN = /^[1-9][0-9]{5}$/;

/** The PIN an owner typed, spaces dropped ("400 602" -> "400602"), or null when it is not a PIN code. */
export function normalisePincode(text: string): string | null {
  const pincode = text.replace(/\s+/g, "");
  return PIN_CODE_PATTERN.test(pincode) ? pincode : null;
}

/** What is wrong with a typed PIN code, in the words the owner reads, or null when it is one. */
export function pinCodeProblem(text: string): string | null {
  const typed = text.replace(/\s+/g, "");
  if (PIN_CODE_PATTERN.test(typed)) return null;
  return /^0[0-9]{5}$/.test(typed) ? "PIN codes don't start with 0." : "Enter your 6-digit PIN code.";
}

/** What the Listing tab learns from a PIN code: everything here is safe to send to the browser. */
export type PinLookup =
  | { readonly kind: "not-found" }
  | {
      readonly kind: "opened";
      readonly pincode: string;
      readonly stateCode: string;
      readonly districtSlug: string;
      readonly districtName: string;
    }
  | {
      readonly kind: "elsewhere";
      readonly pincode: string;
      readonly stateCode: string;
      readonly stateName: string;
      readonly districtName: string;
      readonly localities: readonly PickOption[];
    };

/** A lookup that found its PIN. */
export type FoundPinLookup = Exclude<PinLookup, { readonly kind: "not-found" }>;

/** A PIN that was found: an opened district keeps the area picker, anywhere else picks one of the PIN's localities. */
export function pinLookupOf(record: PincodeRecord): FoundPinLookup {
  if (isOpenedDistrict(record.stateCode, record.districtSlug)) {
    return {
      kind: "opened",
      pincode: record.pincode,
      stateCode: record.stateCode,
      districtSlug: record.districtSlug,
      districtName: record.districtName,
    };
  }
  return {
    kind: "elsewhere",
    pincode: record.pincode,
    stateCode: record.stateCode,
    stateName: stateName(record.stateCode) ?? record.stateCode.toUpperCase(),
    districtName: record.districtName,
    localities: record.localities.map((locality) => ({ value: locality.slug, label: locality.name })),
  };
}

/** The answer to a PIN lookup, found or not. */
export function publicPinLookup(record: PincodeRecord | null): PinLookup {
  return record === null ? { kind: "not-found" } : pinLookupOf(record);
}

/** "North 24 Parganas, West Bengal": where a found PIN is, as the Listing tab shows it; null for one not found. */
export function pinPlaceName(lookup: FoundPinLookup): string;
export function pinPlaceName(lookup: PinLookup): string | null;
export function pinPlaceName(lookup: PinLookup): string | null {
  switch (lookup.kind) {
    case "not-found":
      return null;
    case "opened":
      return `${lookup.districtName}, ${stateName(lookup.stateCode) ?? lookup.stateCode.toUpperCase()}`;
    case "elsewhere":
      return `${lookup.districtName}, ${lookup.stateName}`;
  }
}

/**
 * The locality to keep when a PIN is looked up: the one already picked if this PIN has it too, else the PIN's only
 * locality when it has just one (there is nothing to ask), else none.
 */
export function keptLocality(localities: readonly PickOption[], pickedSlug: string | null): PickOption | null {
  const kept = localities.find((locality) => locality.value === pickedSlug);
  if (kept !== undefined) return kept;
  return localities.length === 1 ? (localities[0] ?? null) : null;
}
