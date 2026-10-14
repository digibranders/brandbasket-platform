/**
 * The Get started and Add lead forms' field names, empty values and states. Client components import this module;
 * the parser in lead-form.ts pulls in the phone metadata, so the browser must never import that one.
 */

export const LEAD_FIELDS = ["name", "businessName", "email", "phone", "phoneCountry", "businessType", "message"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

/** Bots fill in every input they find. A real visitor never sees this one, so anything in it is a bot. */
export const LEAD_HONEYPOT_FIELD = "website";

/** What the visitor typed, kept so a failed submit does not empty the form. */
export type LeadValues = Readonly<Record<LeadField, string>>;

export const EMPTY_LEAD_VALUES: LeadValues = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  phoneCountry: "",
  businessType: "",
  message: "",
};

export type LeadFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly field: LeadField | null;
      readonly values: LeadValues;
    }
  | { readonly status: "sent"; readonly name: string; readonly email: string };

export const initialLeadFormState: LeadFormState = { status: "idle" };
