import { z } from "zod";

export const MAX_EMAIL_LENGTH = 254;
export const EMAIL_FORMAT_MESSAGE = "Enter a valid email address.";

const emailRules = z.email(EMAIL_FORMAT_MESSAGE);

export function requiredEmail(missingMessage: string) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, missingMessage)
    .max(MAX_EMAIL_LENGTH, "That email address is too long.")
    .pipe(emailRules);
}

/** Blank becomes null; anything typed must be a real address. */
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, "That email address is too long.")
  .pipe(z.union([z.literal("").transform(() => null), emailRules]));
