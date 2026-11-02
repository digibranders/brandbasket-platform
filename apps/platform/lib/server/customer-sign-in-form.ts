import "server-only";
import { isPhoneAccountEmail } from "@brandbasket/db";
import { z } from "zod";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";

/*
 * What a customer signs in or asks for a new password with: the mobile number given at sign-up, or the email the
 * account was made with. One field takes either; anything with an @ is read as an email. Server-side: reading a phone
 * number needs the full number library, which the browser is not sent.
 */

/** Most owners are in India, so a number without a country code is read as Indian. */
const DEFAULT_PHONE_COUNTRY = "IN";
const MAX_IDENTIFIER_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MISSING_MESSAGE = "Enter your email or mobile number.";
const INVALID_MESSAGE = "Enter a valid email address or mobile number.";

const emailSchema = z.string().max(MAX_IDENTIFIER_LENGTH, "That email address is too long.").pipe(z.email("Enter a valid email address."));

export type AccountIdentifier =
  | { readonly kind: "phone"; /** E.164. */ readonly phone: string }
  | { readonly kind: "email"; /** Trimmed and lowercased, as accounts are stored. */ readonly email: string };

export type IdentifierParseResult =
  | { readonly success: true; readonly identifier: AccountIdentifier }
  | { readonly success: false; readonly message: string };

export function parseAccountIdentifier(typed: string): IdentifierParseResult {
  const value = typed.trim();
  if (value === "") return { success: false, message: MISSING_MESSAGE };
  if (value.includes("@")) {
    const email = emailSchema.safeParse(value.toLowerCase());
    if (!email.success) return { success: false, message: email.error.issues[0]?.message ?? "Enter a valid email address." };
    // A phone account's placeholder address is not a way in: signing in by it would get that account a second
    // password-guessing budget beside the one kept for its number.
    if (isPhoneAccountEmail(email.data)) return { success: false, message: INVALID_MESSAGE };
    return { success: true, identifier: { kind: "email", email: email.data } };
  }
  const phone = parsePhoneEntry({ country: DEFAULT_PHONE_COUNTRY, number: value }, MISSING_MESSAGE);
  if (!phone.success) return { success: false, message: INVALID_MESSAGE };
  if (phone.e164 === null) return { success: false, message: MISSING_MESSAGE };
  return { success: true, identifier: { kind: "phone", phone: phone.e164 } };
}

export interface CustomerSignInInput {
  readonly identifier: AccountIdentifier;
  readonly password: string;
}

export type CustomerSignInParseResult =
  | { readonly success: true; readonly data: CustomerSignInInput }
  /** `typed` is echoed back into the field so a failed sign-in does not empty it. */
  | { readonly success: false; readonly message: string; readonly typed: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseCustomerSignInForm(formData: FormData): CustomerSignInParseResult {
  const typed = textValue(formData, "identifier").trim();
  const identifier = parseAccountIdentifier(typed);
  if (!identifier.success) return { success: false, message: identifier.message, typed };
  const password = textValue(formData, "password");
  if (password === "") return { success: false, message: "Enter your password.", typed };
  if (password.length > MAX_PASSWORD_LENGTH) return { success: false, message: "That password is too long.", typed };
  return { success: true, data: { identifier: identifier.identifier, password } };
}
