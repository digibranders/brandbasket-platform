import { isValidGstin, normaliseGstin } from "@brandbasket/billing";
import "server-only";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import type { OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { optionalEmail } from "@brandbasket/shared/lib/validation/contact";
import { cleanLine, cleanMultiline } from "@brandbasket/shared/lib/validation/text";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { BUSINESS_ADDRESS_MAX_LENGTH, readBusinessName } from "@/lib/business-name";
import {
  BUSINESS_ABOUT_MAX_LENGTH,
  BUSINESS_ABOUT_MAX_WORDS,
  BUSINESS_DETAILS_FIELDS,
  limitWords,
  WHATSAPP_SAME_VALUE,
} from "@/lib/business-details-fields";
import {
  DIRECTIONS_NOTE_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  ESTABLISHED_YEAR_MIN,
  HOLIDAY_HOURS_MAX_LENGTH,
  SERVICE_AREA_MAX_LENGTH,
  YES_VALUE,
} from "@/lib/business-profile-fields";
import { parseListingWebsite } from "@/lib/listing-website";
import { parseMapsLink, type MapsPin } from "@/lib/maps-link";
import { parseSocialLink, type SocialNetwork } from "@/lib/social-link";
import { parseHoursForm } from "@/lib/onboarding/business-form";
import { OWNER_FORM_FIELDS_MESSAGE, ownerFormCheck } from "@/lib/owner-form";

/*
 * Server only: parses the Details tab of the Business profile (docs/superpowers/specs/2026-10-01-business-profile-
 * design.md): the business's name, address, phone, WhatsApp, directions, website, opening hours and a few words about
 * it. The phone rules load libphonenumber's full metadata, so the form shares its limits from
 * lib/business-details-fields.ts instead.
 */

/** Most owners are in India, so a number without a country code is read as Indian. */
const PHONE_COUNTRY = "IN";

/** HoursEditor's fields: `hours.<day>.mode|opens|closes` for each weekday, Monday first. */
const HOURS_FIELDS = WEEKDAYS.flatMap((_, day) => ["mode", "opens", "closes"].map((part) => `hours.${String(day)}.${part}`));

const isDetailsForm = ownerFormCheck([...BUSINESS_DETAILS_FIELDS, ...HOURS_FIELDS]);

export interface BusinessDetailsInput {
  readonly businessName: string;
  /** The name as the last part of a web address. */
  readonly slug: string;
  readonly streetAddress: string;
  /** E.164. */
  readonly phone: string;
  /** E.164, or null for no WhatsApp. */
  readonly whatsapp: string | null;
  readonly mapsUrl: string | null;
  readonly pin: MapsPin | null;
  /** An http(s) address, or null. */
  readonly websiteUrl: string | null;
  readonly about: string | null;
  readonly directionsNote: string | null;
  readonly email: string | null;
  /** A valid GSTIN in upper case, or null when left blank. */
  readonly gstNumber: string | null;
  readonly instagramUrl: string | null;
  readonly facebookUrl: string | null;
  readonly linkedinUrl: string | null;
  readonly establishedYear: number | null;
  readonly serviceArea: string | null;
  readonly holidayHours: string | null;
  /** Open round the clock for emergencies. */
  readonly open24x7: boolean;
  /** Only the days the owner set; an empty list clears the hours. */
  readonly hours: readonly OpeningHours[];
}

export type BusinessDetailsParseResult =
  | { readonly success: true; readonly data: BusinessDetailsInput }
  /** `field` names the box to mark: one of BUSINESS_DETAILS_FIELDS, an hours field like "hours.2.opens", or null. */
  | { readonly success: false; readonly field: string | null; readonly message: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function problem(field: string | null, message: string): BusinessDetailsParseResult {
  return { success: false, field, message };
}

/** A typed number as E.164; null when the box is empty and `missingMessage` is null. */
function readPhone(typed: string, missingMessage: string | null): { ok: true; e164: string | null } | { ok: false; message: string } {
  const parsed = parsePhoneEntry({ country: PHONE_COUNTRY, number: typed }, missingMessage);
  return parsed.success ? { ok: true, e164: parsed.e164 } : { ok: false, message: parsed.message };
}

/** A short single-line text: trimmed, blank is null, longer than `max` is refused. */
function readShortText(formData: FormData, field: string, max: number, tooLong: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = cleanLine(textValue(formData, field)).replace(/\s+/g, " ");
  if (value.length > max) return { ok: false, message: tooLong };
  return { ok: true, value: value === "" ? null : value };
}

/** The founding year: blank is none; otherwise four digits between ESTABLISHED_YEAR_MIN and this year. */
function readEstablishedYear(typed: string, now: Date): { ok: true; year: number | null } | { ok: false; message: string } {
  const value = typed.trim();
  if (value === "") return { ok: true, year: null };
  const latest = now.getFullYear();
  const message = `Enter the year as four digits, between ${String(ESTABLISHED_YEAR_MIN)} and ${String(latest)}.`;
  if (!/^\d{4}$/.test(value)) return { ok: false, message };
  const year = Number(value);
  return year >= ESTABLISHED_YEAR_MIN && year <= latest ? { ok: true, year } : { ok: false, message };
}

export interface BusinessDetailsParseOptions {
  /**
   * The business is a claim on one the directory already had: its name, address and number are the directory's, which the
   * form shows but does not take, so no address is asked for (and none is kept).
   */
  readonly claimed?: boolean;
}

export function parseBusinessDetailsForm(
  formData: FormData,
  now: Date = new Date(),
  { claimed = false }: BusinessDetailsParseOptions = {},
): BusinessDetailsParseResult {
  if (!isDetailsForm(formData)) return problem(null, OWNER_FORM_FIELDS_MESSAGE);

  const name = readBusinessName(formData);
  if (!name.success) return problem("businessName", name.message);

  const streetAddress = claimed ? "" : cleanLine(textValue(formData, "address")).replace(/\s+/g, " ");
  if (streetAddress === "" && !claimed) return problem("address", "Enter your business's address.");
  if (streetAddress.length > BUSINESS_ADDRESS_MAX_LENGTH) {
    return problem("address", `Keep the address to ${String(BUSINESS_ADDRESS_MAX_LENGTH)} characters.`);
  }

  const phone = readPhone(textValue(formData, "phone"), "Enter the business's phone number.");
  if (!phone.ok) return problem("phone", phone.message);
  if (phone.e164 === null) return problem("phone", "Enter the business's phone number.");

  let whatsapp: string | null = phone.e164;
  if (textValue(formData, "whatsappSame") !== WHATSAPP_SAME_VALUE) {
    const typed = readPhone(textValue(formData, "whatsapp"), null);
    if (!typed.ok) return problem("whatsapp", typed.message);
    whatsapp = typed.e164;
  }

  const maps = parseMapsLink(textValue(formData, "maps"));
  if (!maps.ok) return problem("maps", maps.message);

  const website = parseListingWebsite(textValue(formData, "website"));
  if (!website.ok) return problem("website", website.message);

  // A longer description is cut to the limit rather than refused: the form already stops at 250 words as it is typed
  // or pasted, and this keeps the same rule for anything that reaches the server another way.
  const aboutText = limitWords(cleanMultiline(textValue(formData, "about")), BUSINESS_ABOUT_MAX_WORDS).slice(0, BUSINESS_ABOUT_MAX_LENGTH).trimEnd();

  const note = readShortText(formData, "directionsNote", DIRECTIONS_NOTE_MAX_LENGTH, `Keep it to ${String(DIRECTIONS_NOTE_MAX_LENGTH)} characters.`);
  if (!note.ok) return problem("directionsNote", note.message);

  const typedEmail = textValue(formData, "email").trim();
  const email = optionalEmail.safeParse(typedEmail);
  if (!email.success) return problem("email", email.error.issues[0]?.message ?? "Enter a valid email address.");
  if (email.data !== null && email.data.length > EMAIL_MAX_LENGTH) return problem("email", "That email address is too long.");

  const social: Record<SocialNetwork, string | null> = { instagram: null, facebook: null, linkedin: null };
  for (const network of ["instagram", "facebook", "linkedin"] as const) {
    const link = parseSocialLink(network, textValue(formData, network));
    if (!link.ok) return problem(network, link.message);
    social[network] = link.url;
  }

  // Optional. Typed with spaces or in lower case is fine; what is saved is the GSTIN itself, checked the way billing does.
  const typedGst = normaliseGstin(textValue(formData, "gstNumber"));
  if (typedGst !== "" && !isValidGstin(typedGst)) return problem("gstNumber", "That isn't a valid GST number. It has 15 letters and digits, like 27AAPFU0939F1ZV.");

  const year = readEstablishedYear(textValue(formData, "establishedYear"), now);
  if (!year.ok) return problem("establishedYear", year.message);

  const area = readShortText(formData, "serviceArea", SERVICE_AREA_MAX_LENGTH, `Keep it to ${String(SERVICE_AREA_MAX_LENGTH)} characters.`);
  if (!area.ok) return problem("serviceArea", area.message);

  const holidays = readShortText(formData, "holidayHours", HOLIDAY_HOURS_MAX_LENGTH, `Keep it to ${String(HOLIDAY_HOURS_MAX_LENGTH)} characters.`);
  if (!holidays.ok) return problem("holidayHours", holidays.message);

  const hours = parseHoursForm(formData);
  if (!hours.success) return problem(hours.field, hours.message);

  return {
    success: true,
    data: {
      businessName: name.businessName,
      slug: name.slug,
      streetAddress,
      phone: phone.e164,
      whatsapp,
      mapsUrl: maps.url,
      pin: maps.pin,
      websiteUrl: website.url,
      about: aboutText === "" ? null : aboutText,
      directionsNote: note.value,
      email: email.data,
      gstNumber: typedGst === "" ? null : typedGst,
      instagramUrl: social.instagram,
      facebookUrl: social.facebook,
      linkedinUrl: social.linkedin,
      establishedYear: year.year,
      serviceArea: area.value,
      holidayHours: holidays.value,
      open24x7: textValue(formData, "open24x7") === YES_VALUE,
      hours: hours.data,
    },
  };
}
