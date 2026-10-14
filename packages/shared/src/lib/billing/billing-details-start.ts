import type { BillingProfileInput } from "@firstfold/db";
import { stateCodeOfIndiaPostName } from "../directory/india-states";
import { FALLBACK_PHONE_COUNTRY } from "../phone/fields";

/**
 * What the billing details form starts with and what a card lists, worked out from the saved row and the onboarding
 * profile. Plain data and no database or request access, so the choices (what a field starts with, what the card
 * lists) are tested without either. Both the customer's Billing page and the staff client page read the rows and call
 * these, so a field starts the same way for both.
 */

/** What the form fields start with, all as text, so a client component can take it as props. */
export interface BillingDetailsStart {
  readonly legalName: string;
  readonly gstin: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly postalCode: string;
  readonly stateCode: string;
  readonly email: string;
  readonly phoneCountry: string;
  readonly phone: string;
}

/** The saved details as the card lists them. */
export interface SavedBillingDetails {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly address: string;
  readonly stateCode: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/** The onboarding address, the part of the business profile a billing address can start from. */
export interface OnboardingAddress {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
}

/** A saved phone number split for the phone field: its country (null when it has none) and the number as typed there. */
export interface PhoneStart {
  readonly country: string | null;
  readonly number: string;
}

/** The saved details as lines for the card: street, city and pincode on one line, blank parts left out. */
export function savedBillingDetails(profile: BillingProfileInput): SavedBillingDetails {
  const address = [profile.addressLine1, profile.addressLine2, `${profile.city} ${profile.postalCode}`]
    .filter((line): line is string => line !== null && line.trim() !== "")
    .join(", ");
  return {
    legalName: profile.legalName,
    gstin: profile.gstin,
    address,
    stateCode: profile.stateCode,
    email: profile.email,
    phone: profile.phone,
  };
}

/**
 * What each field starts with. Saved details win; with none, the legal name is the business's name and the address is
 * the onboarding one, with the state taken from the region India Post's directory names. A region that is not a state
 * leaves the State field on its "Choose your state" prompt.
 */
export function billingDetailsStart(input: {
  readonly profile: BillingProfileInput | null;
  readonly businessName: string;
  readonly onboarding: OnboardingAddress | null;
  readonly phone: PhoneStart;
}): BillingDetailsStart {
  const { profile, businessName, onboarding, phone } = input;
  const region = onboarding?.region?.trim() ?? "";
  const onboardingState = region === "" ? null : stateCodeOfIndiaPostName(region);
  return {
    legalName: profile?.legalName ?? businessName,
    gstin: profile?.gstin ?? "",
    addressLine1: profile?.addressLine1 ?? onboarding?.addressLine1 ?? "",
    addressLine2: profile?.addressLine2 ?? onboarding?.addressLine2 ?? "",
    city: profile?.city ?? onboarding?.city ?? "",
    postalCode: profile?.postalCode ?? onboarding?.postalCode ?? "",
    stateCode: profile?.stateCode ?? onboardingState ?? "",
    email: profile?.email ?? "",
    phoneCountry: phone.country ?? FALLBACK_PHONE_COUNTRY,
    phone: phone.number,
  };
}
