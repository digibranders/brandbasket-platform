import "server-only";
import type { BusinessContactInput } from "@brandbasket/db";
import { PHONE_COUNTRY_FIELD } from "@brandbasket/shared/lib/phone/fields";
import { optionalEmail } from "@brandbasket/shared/lib/validation/contact";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { z } from "zod";
import { cleanLine, CONTACT_LIMITS } from "./rules";

/*
 * The contact form's field limits, ported from apps/platform lib/onboarding/business-form.ts (parseContactForm). Server only:
 * the phone rules load libphonenumber's metadata, which the browser must never import. Tagline, description and the Google
 * link are not editable here, only in onboarding.
 */

const line = z.string().default("");

/** A single-line field up to `max` characters; blank becomes null so saving a blank clears it. */
function optionalLine(max: number, tooLong: string) {
  return line
    .transform(cleanLine)
    .pipe(z.string().max(max, tooLong))
    .transform((entry) => (entry === "" ? null : entry));
}

export const contactSchema = z
  .object({
    displayName: line
      .transform(cleanLine)
      .pipe(z.string().min(1, "Tell us your business name.").max(CONTACT_LIMITS.displayName, "That business name is too long.")),
    phone: line,
    [PHONE_COUNTRY_FIELD]: line,
    email: line.pipe(optionalEmail),
    addressLine1: optionalLine(CONTACT_LIMITS.addressLine, "That address line is too long."),
    addressLine2: optionalLine(CONTACT_LIMITS.addressLine, "That address line is too long."),
    city: optionalLine(CONTACT_LIMITS.city, "That city name is too long."),
    region: optionalLine(CONTACT_LIMITS.region, "That state or region is too long."),
    postalCode: optionalLine(CONTACT_LIMITS.postalCode, "That postal code is too long."),
    country: optionalLine(CONTACT_LIMITS.country, "That country name is too long."),
    serviceAreas: optionalLine(CONTACT_LIMITS.serviceAreas, "Keep the areas you serve to 300 characters."),
  })
  .transform((form, context): BusinessContactInput => {
    const phone = parsePhoneEntry({ country: form[PHONE_COUNTRY_FIELD], number: form.phone }, null);
    if (!phone.success) {
      context.addIssue({ code: "custom", path: [phone.part === "country" ? PHONE_COUNTRY_FIELD : "phone"], message: phone.message });
    }
    return {
      displayName: form.displayName,
      phone: phone.success ? phone.e164 : null,
      email: form.email,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      region: form.region,
      postalCode: form.postalCode,
      country: form.country,
      serviceAreas: form.serviceAreas,
    };
  });
