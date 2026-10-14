import "server-only";
import type { BillingProfile } from "@firstfold/db";
import {
  billingDetailsStart,
  savedBillingDetails,
  type BillingDetailsStart,
  type OnboardingAddress,
  type SavedBillingDetails,
} from "@firstfold/shared/lib/billing/billing-details-start";
import type { PhoneCountryOption } from "@firstfold/shared/lib/phone/fields";
import { phoneCountryOptions } from "@firstfold/shared/server/phone-countries";
import { savedPhoneStart } from "@firstfold/shared/server/phone-defaults";

/** What the client page's Billing details section shows and starts its form with. */
export interface ClientBillingDetails {
  /** Null until the customer or staff save details. */
  readonly saved: SavedBillingDetails | null;
  /** The saved details, or else the business name and its onboarding address, so the form rarely starts empty. */
  readonly start: BillingDetailsStart;
  /**
   * Built on the server: libphonenumber's metadata never reaches the browser. The list (245 countries, about 22 KB as
   * JSON) travels with every rupee client's page because the form is a client component and its props are sent whether
   * or not the disclosure is open. Sending it only on open would need a second request and a loading state on a staff
   * page opened a few times a day, so it is not worth the extra moving part.
   */
  readonly phoneCountries: readonly PhoneCountryOption[];
}

/**
 * The billing details a client's page lists and edits, from the saved row and the profile the client filled in at
 * onboarding. The form starts the way the customer's own form does (billingDetailsStart), so staff see the same
 * suggestions the customer would.
 */
export function clientBillingDetails(input: {
  readonly profile: BillingProfile | null;
  readonly businessName: string;
  readonly onboarding: OnboardingAddress | null;
}): ClientBillingDetails {
  const { profile, businessName, onboarding } = input;
  return {
    saved: profile === null ? null : savedBillingDetails(profile),
    start: billingDetailsStart({ profile, businessName, onboarding, phone: savedPhoneStart(profile?.phone ?? null) }),
    phoneCountries: phoneCountryOptions(),
  };
}
