import "server-only";
import { type BillingDetails, type CustomerBillingField, firstCustomerBillingProblem, parseCustomerBillingDetails } from "@brandbasket/shared/lib/billing/billing-details-form";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { HOME_COUNTRY } from "@brandbasket/shared/lib/countries";
import { isIndiaStateCode } from "@brandbasket/shared/lib/directory/india-states";
import { isPrintableOnInvoice, normaliseInvoiceText } from "@brandbasket/shared/lib/billing/invoice-text";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { CHECKOUT_AGREE_MESSAGE } from "./checkout-signup-messages";
import { AGREE_FIELD, AGREE_VALUE, JOIN_BUSINESS_NAME_MAX_LENGTH, JOIN_NAME_MAX_LENGTH, readContact, readPhone, textValue, type JoinPhone } from "./join-form";

/*
 * The one-screen checkout's form (plan 64, section 3.2): what a visitor sends when they pay before they have an account.
 * There is no password, no code and no country field. The country is the visitor's own, read by the server from the
 * request (D6) and handed in, so a form can never change which currency the price was shown in. Server code only: the
 * GSTIN and phone rules load metadata the browser must not.
 */

export type CheckoutBilling = "monthly" | "yearly";

/** The field a refusal belongs under, so the screen can put the message and the focus there. */
export type CheckoutField = "service" | "name" | "businessName" | "email" | "phone" | "stateCode" | "agree" | CustomerBillingField;

export interface CheckoutSignupInput {
  readonly services: readonly MonthlyAddOnId[];
  readonly billing: CheckoutBilling;
  readonly name: string;
  /** One clean line, printable on an invoice when the buyer is billed in rupees. */
  readonly businessName: string;
  readonly email: string;
  readonly phone: JoinPhone;
  /** The visitor's country, from the server. */
  readonly country: string;
  /** The GST state: India only. From the GSTIN when there is one, else the one picked. */
  readonly stateCode: string | null;
  /** Only with a GSTIN, and only for India: the profile to save before paying. A buyer without one gives state and country alone (D5). */
  readonly gstinDetails: BillingDetails | null;
  readonly agreed: true;
}

export type CheckoutParseResult =
  | { readonly success: true; readonly data: CheckoutSignupInput }
  | { readonly success: false; readonly field: CheckoutField; readonly message: string };

const fail = (field: CheckoutField, message: string): CheckoutParseResult => ({ success: false, field, message });

const SERVICE_MESSAGE = "Add a service to continue.";
const NAME_MESSAGE = "Tell us your name.";
const BUSINESS_MESSAGE = "Tell us your business's name.";
const PRINTABLE_MESSAGE = "Your business name cannot be printed on an invoice. Use English letters.";
const PHONE_MISSING_MESSAGE = "Enter your mobile number.";
const STATE_MESSAGE = "Choose your state.";

/** What the checkout form was sent with, for a visitor in `country`. The first problem is the one nearest the top of the screen. */
export function parseCheckoutSignupForm(formData: FormData, country: string): CheckoutParseResult {
  const services = readBundleSelection(formData.getAll("service").filter((value): value is string => typeof value === "string"));
  if (services.length === 0) return fail("service", SERVICE_MESSAGE);
  const billing: CheckoutBilling = formData.get("billing") === "yearly" ? "yearly" : "monthly";
  const inIndia = country === HOME_COUNTRY;

  const name = cleanLine(textValue(formData, "name")).replace(/\s+/g, " ");
  if (name === "") return fail("name", NAME_MESSAGE);
  if (name.length > JOIN_NAME_MAX_LENGTH) return fail("name", "That name is too long.");

  const typedBusiness = cleanLine(textValue(formData, "businessName")).replace(/\s+/g, " ");
  if (typedBusiness === "") return fail("businessName", BUSINESS_MESSAGE);
  if (typedBusiness.length > JOIN_BUSINESS_NAME_MAX_LENGTH) return fail("businessName", "That business name is too long.");
  const businessName = normaliseInvoiceText(typedBusiness);
  // Only a rupee purchase gets a tax invoice, and an unprintable name leaves it unissued.
  if (inIndia && !isPrintableOnInvoice(businessName)) return fail("businessName", PRINTABLE_MESSAGE);

  const contact = readContact(formData);
  if (!contact.success) return fail("email", contact.message);
  const phone = readPhone(formData);
  if (!phone.success) return fail("phone", phone.message);
  // A number the country could not have is refused here, before the network's sign-up budget is spent on it.
  const realNumber = parsePhoneEntry(phone.phone, PHONE_MISSING_MESSAGE);
  if (!realNumber.success) return fail("phone", realNumber.message);

  let stateCode: string | null = null;
  let gstinDetails: BillingDetails | null = null;
  if (inIndia) {
    if (formData.get("hasGstin") === "on") {
      const parsed = parseCustomerBillingDetails(formData, { businessName, keep: { legalName: null, email: null, phone: null } });
      if (!parsed.ok) {
        const problem = firstCustomerBillingProblem(parsed.errors);
        return fail(problem.field, problem.message);
      }
      gstinDetails = parsed.details;
      stateCode = parsed.details.stateCode;
    } else {
      const picked = textValue(formData, "stateCode");
      if (!isIndiaStateCode(picked)) return fail("stateCode", STATE_MESSAGE);
      stateCode = picked;
    }
  }

  if (textValue(formData, AGREE_FIELD) !== AGREE_VALUE) return fail("agree", CHECKOUT_AGREE_MESSAGE);
  return {
    success: true,
    data: { services, billing, name, businessName, email: contact.contact.email, phone: phone.phone, country, stateCode, gstinDetails, agreed: true },
  };
}
