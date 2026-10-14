import "server-only";
import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@fynix/billing/gstin";
import { isIndiaStateCode, stateName } from "../directory/india-states";
import { optionalEmail } from "../validation/contact";
import { parsePhoneEntry } from "../validation/phone";
import { normaliseInvoiceText } from "./invoice-text";

/**
 * The billing details form, shared by the customer's Billing page and the staff client page: what each field may hold
 * and the words for each refusal. No database or request access, but server code only: the phone rules load
 * libphonenumber's full metadata through validation/phone.ts, which is marked "server-only". Client components may
 * `import type` from here; the parser itself runs in the server actions. The database checks the same limits again
 * (0119, 0120).
 */

export interface BillingDetails {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly postalCode: string;
  readonly stateCode: string;
  /** Null when left blank: invoices and billing questions go to the account's own email and number. */
  readonly email: string | null;
  readonly phone: string | null;
}

/** The form's fields in the order it shows them, so the first problem is the one nearest the top. */
export const BILLING_DETAILS_FIELDS = [
  "legalName",
  "gstin",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "stateCode",
  "email",
  "phoneCountry",
  "phone",
] as const;

export type BillingDetailsField = (typeof BILLING_DETAILS_FIELDS)[number];
export type BillingDetailsErrors = Partial<Record<BillingDetailsField, string>>;

export type ParsedBillingDetails =
  | { readonly ok: true; readonly details: BillingDetails }
  | { readonly ok: false; readonly errors: BillingDetailsErrors };

/** Printable ASCII: every character the invoice font is checked to draw (scripts/embed-invoice-fonts.mjs). */
const PRINTABLE = /^[\x20-\x7E]+$/;
const PINCODE = /^[1-9][0-9]{5}$/;

function text(data: FormData, key: BillingDetailsField): string {
  const value = data.get(key);
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * A field that prints on the invoice: a phone keyboard's curly apostrophe or a pasted dash is saved as the plain
 * character it stands for, so "Rao\u2019s Dental" is accepted and prints as "Rao's Dental". Letters of another script are
 * left alone and still refused by PRINTABLE.
 */
function printedText(data: FormData, key: BillingDetailsField): string {
  return normaliseInvoiceText(text(data, key));
}

interface ParsedAddress {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly postalCode: string;
}

/** The street, city and pincode, which both forms ask the same way. Problems go into `errors`. */
function parseAddress(data: FormData, errors: BillingDetailsErrors): ParsedAddress {
  const addressLine1 = printedText(data, "addressLine1");
  const addressLine2 = printedText(data, "addressLine2");
  const city = printedText(data, "city");
  const postalCode = text(data, "postalCode").replace(/\s/g, "");
  if (addressLine1 === "" || addressLine1.length > 200 || !PRINTABLE.test(addressLine1)) errors.addressLine1 = "Enter the street address, in English letters.";
  if (addressLine2.length > 200 || (addressLine2 !== "" && !PRINTABLE.test(addressLine2))) errors.addressLine2 = "Keep this line in English letters, under 200 characters.";
  if (city === "" || city.length > 100 || !PRINTABLE.test(city)) errors.city = "Enter the city, in English letters.";
  if (!PINCODE.test(postalCode)) errors.postalCode = "Enter a 6 digit pincode.";
  return { addressLine1, addressLine2: addressLine2 === "" ? null : addressLine2, city, postalCode };
}

function legalNameProblem(legalName: string): string | null {
  if (legalName === "" || legalName.length > 200) return "Enter the name to bill, as on your GST registration.";
  if (!PRINTABLE.test(legalName)) return "Enter the name as on your GST registration, in English letters.";
  return null;
}

export function parseBillingDetails(data: FormData): ParsedBillingDetails {
  const errors: BillingDetailsErrors = {};
  const legalName = printedText(data, "legalName");
  const gstinInput = normaliseGstin(text(data, "gstin"));
  const stateCode = text(data, "stateCode");
  const emailResult = optionalEmail.safeParse(text(data, "email"));
  const phoneResult = parsePhoneEntry({ country: text(data, "phoneCountry"), number: text(data, "phone") }, null);

  const nameProblem = legalNameProblem(legalName);
  if (nameProblem !== null) errors.legalName = nameProblem;
  const address = parseAddress(data, errors);
  if (!isIndiaStateCode(stateCode)) errors.stateCode = "Choose your state.";
  if (!emailResult.success) errors.email = emailResult.error.issues[0]?.message ?? "Enter a valid email address.";
  if (!phoneResult.success) errors[phoneResult.part === "country" ? "phoneCountry" : "phone"] = phoneResult.message;

  let gstin: string | null = null;
  if (gstinInput !== "") {
    if (!isValidGstin(gstinInput)) {
      errors.gstin = "This GSTIN is not valid. Check it against your GST registration certificate.";
    } else {
      gstin = gstinInput;
      const registeredIn = stateCodeOfGstin(gstinInput);
      if (errors.stateCode === undefined && registeredIn !== stateCode) {
        const name = stateName(registeredIn) ?? registeredIn;
        errors.stateCode = `This GSTIN is registered in ${name}. Choose ${name}, or check the GSTIN.`;
      }
    }
  }

  if (Object.keys(errors).length > 0 || !emailResult.success || !phoneResult.success) return { ok: false, errors };
  return { ok: true, details: { legalName, gstin, ...address, stateCode, email: emailResult.data, phone: phoneResult.e164 } };
}

/** The customer form's fields in the order it shows them: the checkbox is the one the staff form does not have. */
export const CUSTOMER_BILLING_FIELDS = [
  "hasGstin",
  "legalName",
  "gstin",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
  "stateCode",
] as const;

export type CustomerBillingField = (typeof CUSTOMER_BILLING_FIELDS)[number];
export type CustomerBillingErrors = Partial<Record<CustomerBillingField, string>>;

export type ParsedCustomerBillingDetails =
  | { readonly ok: true; readonly details: BillingDetails }
  | { readonly ok: false; readonly errors: CustomerBillingErrors };

/** The problem to show first on the customer form. */
export function firstCustomerBillingProblem(errors: CustomerBillingErrors): { readonly field: CustomerBillingField; readonly message: string } {
  for (const field of CUSTOMER_BILLING_FIELDS) {
    const message = errors[field];
    if (message !== undefined) return { field, message };
  }
  throw new Error("firstCustomerBillingProblem was given no problem");
}

/** What the customer's own form needs besides what was typed. */
export interface CustomerBillingContext {
  /** The name an invoice goes to when the customer has no GSTIN and no name saved. */
  readonly businessName: string;
  /**
   * What is already saved and this form has no field for, so a save keeps it: the contact (staff can set it) and a legal
   * name saved without a GSTIN (staff can set that too). Without a GSTIN the form shows no name field.
   */
  readonly keep: { readonly legalName: string | null; readonly email: string | null; readonly phone: string | null };
}

/**
 * The customer's billing details form. "I have a GSTIN" opens the GSTIN and legal name; without it the invoice goes to
 * the business's name. A GSTIN fixes the state (it is the first two digits), so the state is taken from it, never asked
 * twice; without one the customer chooses the state, which the server checks against the pincode. The billing contact
 * is not on this form (nothing sends to it), so whatever is saved stays. The staff form keeps `parseBillingDetails`.
 */
export function parseCustomerBillingDetails(data: FormData, context: CustomerBillingContext): ParsedCustomerBillingDetails {
  const errors: CustomerBillingErrors = {};
  const hasGstin = data.get("hasGstin") === "on";
  let legalName = normaliseInvoiceText((context.keep.legalName ?? context.businessName).replace(/\s+/g, " ").trim());
  let gstin: string | null = null;
  let stateCode = text(data, "stateCode");

  if (hasGstin) {
    legalName = printedText(data, "legalName");
    const nameProblem = legalNameProblem(legalName);
    if (nameProblem !== null) errors.legalName = nameProblem;
    const gstinInput = normaliseGstin(text(data, "gstin"));
    if (gstinInput === "") errors.gstin = "Enter your 15 character GSTIN, or untick the box if you do not have one.";
    else if (!isValidGstin(gstinInput)) errors.gstin = "This GSTIN is not valid. Check it against your GST registration certificate.";
    else {
      gstin = gstinInput;
      stateCode = stateCodeOfGstin(gstinInput);
    }
  } else if (legalName === "" || legalName.length > 200 || !PRINTABLE.test(legalName)) {
    // The name field is not on screen without a GSTIN, so the problem is shown under the checkbox.
    errors.hasGstin = "Your business name cannot be printed on an invoice. Change it on your Business page, then save again.";
  }

  const address = parseAddress(data, errors);
  if (!isIndiaStateCode(stateCode)) errors.stateCode = "Choose your state.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, details: { legalName, gstin, ...address, stateCode, email: context.keep.email, phone: context.keep.phone } };
}

/**
 * The refusal when a pincode India Post lists in one state is given with another. Without a GSTIN the state decides
 * whether an invoice charges CGST and SGST or IGST, so a wrong state means a wrong invoice. Null when they agree.
 */
export function pincodeStateProblem(pincodeStateCode: string, chosenStateCode: string): string | null {
  if (pincodeStateCode === chosenStateCode) return null;
  const name = stateName(pincodeStateCode) ?? pincodeStateCode;
  return `This pincode is in ${name}. Choose ${name}, or check the pincode.`;
}

/** The problem to show first, for forms that show one at a time (the panel and console form patterns). */
export function firstBillingDetailsProblem(errors: BillingDetailsErrors): { readonly field: BillingDetailsField; readonly message: string } {
  for (const field of BILLING_DETAILS_FIELDS) {
    const message = errors[field];
    if (message !== undefined) return { field, message };
  }
  throw new Error("firstBillingDetailsProblem was given no problem");
}
