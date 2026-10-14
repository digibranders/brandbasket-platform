/**
 * Server only: parses the Get started and Add lead forms. The phone rules load libphonenumber's full metadata, so
 * client components import field names, empty values and states from lead-form-fields.ts instead.
 */
import "server-only";
import { z } from "zod";
import { BUSINESS_TYPE_VALUES } from "./business-types";
import { LEAD_FIELDS, LEAD_HONEYPOT_FIELD, type LeadField, type LeadValues } from "./lead-form-fields";
import { PHONE_COUNTRY_FIELD } from "./phone/fields";
import { requiredEmail } from "./validation/contact";
import { optionalPhone, phoneFormField } from "./validation/phone";
import { cleanLine, cleanMultiline } from "./validation/text";

const MAX_MESSAGE_LENGTH = 1000;
/** What comes back to the browser after a failed submit is capped, so a huge paste is not echoed into the page. */
const MAX_ECHO_LENGTH = 1200;

const leadSchema = z.object({
  name: z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(1, "Tell us your name.").max(120, "That name is too long.")),
  businessName: z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(1, "Tell us your business name.").max(120, "That business name is too long.")),
  email: requiredEmail("Enter your email address."),
  /** Optional: the email is what every lead has. A blank number is null; one that is typed must be a real number. */
  phone: optionalPhone,
  businessType: z
    .string()
    .transform(cleanLine)
    .pipe(z.enum(BUSINESS_TYPE_VALUES, { error: "Choose the kind of business you run." })),
  message: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().max(MAX_MESSAGE_LENGTH, "Please keep this under 1000 characters."))
    .transform((value) => (value === "" ? null : value)),
});

export type LeadInput = z.output<typeof leadSchema>;

export function leadValuesFrom(formData: FormData): LeadValues {
  const entries = LEAD_FIELDS.map((field) => {
    const value = formData.get(field);
    return [field, typeof value === "string" ? value.slice(0, MAX_ECHO_LENGTH) : ""] as const;
  });
  return Object.fromEntries(entries) as LeadValues;
}

/** True when the hidden field was filled, which only a script does. */
export function isHoneypotFilled(formData: FormData): boolean {
  const value = formData.get(LEAD_HONEYPOT_FIELD);
  return typeof value === "string" && value.trim() !== "";
}

export type LeadParseResult =
  | { readonly success: true; readonly data: LeadInput }
  | { readonly success: false; readonly message: string; readonly field: LeadField | null };

function isLeadField(value: unknown): value is LeadField {
  return typeof value === "string" && (LEAD_FIELDS as readonly string[]).includes(value);
}

function textOf(formData: FormData, field: LeadField): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** The form field an issue is about. Phone issues sit one level down, under the number or the country. */
function fieldOf(path: readonly PropertyKey[]): LeadField | null {
  const [head, part] = path;
  const field = head === "phone" ? phoneFormField(part) : head;
  return isLeadField(field) ? field : null;
}

export function parseLeadForm(formData: FormData): LeadParseResult {
  const input = {
    name: textOf(formData, "name"),
    businessName: textOf(formData, "businessName"),
    email: textOf(formData, "email"),
    phone: { country: textOf(formData, PHONE_COUNTRY_FIELD), number: textOf(formData, "phone") },
    businessType: textOf(formData, "businessType"),
    message: textOf(formData, "message"),
  };

  const result = leadSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const issue = result.error.issues[0];
  return {
    success: false,
    message: issue?.message ?? "Check the form and try again.",
    field: issue === undefined ? null : fieldOf(issue.path),
  };
}
