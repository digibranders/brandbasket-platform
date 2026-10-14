/**
 * Server only: parses step 01. The phone rules load libphonenumber's full metadata, so client components import the
 * weekday list, field names and types from business-fields.ts instead.
 */
import "server-only";
import { z } from "zod";
import { PHONE_COUNTRY_FIELD } from "@fynix/shared/lib/phone/fields";
import { optionalEmail } from "@fynix/shared/lib/validation/contact";
import { optionalPhone, phoneFormField } from "@fynix/shared/lib/validation/phone";
import { cleanLine, cleanMultiline } from "@fynix/shared/lib/validation/text";
import { blankOr, httpsUrl, isGoogleBusinessUrl } from "@/lib/validation/url";
import { dayModeField, WEEKDAYS, type BusinessStepInput } from "@fynix/shared/lib/onboarding/business-fields";
import { fieldNameOf, textField, type StepParseResult } from "@fynix/shared/lib/onboarding/form-result";
import { isDayMode, type OpeningHours } from "@fynix/shared/lib/onboarding/hours";

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PROFILE_TEXT_FIELDS = [
  "tagline",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "serviceAreas",
] as const;

function optionalLine(max: number, tooLong: string) {
  return z
    .string()
    .transform(cleanLine)
    .pipe(z.string().max(max, tooLong))
    .transform((value) => (value === "" ? null : value));
}

export const GOOGLE_LINK_MESSAGE = "Paste the full link to your Google Business Profile, starting https://";
export const GOOGLE_HOST_MESSAGE =
  "That doesn't look like a Google Maps link. Find your business in Google Maps, tap Share and copy the link.";
export const ROUND_THE_CLOCK_MESSAGE = "For round-the-clock opening, choose Open 24 hours.";

const googleUrl = blankOr(
  httpsUrl({ invalid: GOOGLE_LINK_MESSAGE, tooLong: "That link is too long. Paste the Share link from Google Maps instead." }).refine(
    (href) => isGoogleBusinessUrl(new URL(href)),
    GOOGLE_HOST_MESSAGE,
  ),
);

const dayHours = z
  .object({
    mode: z.string().refine(isDayMode, "Choose how this day works: not set, open, closed or open 24 hours."),
    opens: z.string().trim(),
    closes: z.string().trim(),
  })
  .superRefine((day, context) => {
    if (day.mode !== "open") return;
    if (!TIME_OF_DAY.test(day.opens)) {
      context.addIssue({
        code: "custom",
        path: ["opens"],
        message: "Add an opening time, or choose another option for this day.",
      });
      return;
    }
    if (!TIME_OF_DAY.test(day.closes)) {
      context.addIssue({
        code: "custom",
        path: ["closes"],
        message: "Add a closing time, or choose another option for this day.",
      });
      return;
    }
    if (day.opens === day.closes) {
      context.addIssue({ code: "custom", path: ["closes"], message: ROUND_THE_CLOCK_MESSAGE });
    }
  });

/** The day's entry, or null for a day left "Not set". Only called on a day that passed `dayHours`. */
function openingHoursOf(day: { mode: string; opens: string; closes: string }, dayOfWeek: number): OpeningHours | null {
  switch (day.mode) {
    case "open":
      return { dayOfWeek, mode: "open", opensAt: day.opens, closesAt: day.closes };
    case "closed":
      return { dayOfWeek, mode: "closed" };
    case "all-day":
      return { dayOfWeek, mode: "all-day" };
    default:
      return null;
  }
}

/** Reads `hours.{day}.mode|opens|closes` for every weekday, Monday first, exactly as HoursEditor names its
 * fields. A day not sent reads as "unset". Shared by parseBusinessForm and parseHoursForm so both parse the same
 * fields the same way. */
function hoursInputFrom(formData: FormData): { mode: string; opens: string; closes: string }[] {
  return WEEKDAYS.map((_, day) => ({
    mode: textField(formData, dayModeField(day)) || "unset",
    opens: textField(formData, `hours.${day}.opens`),
    closes: textField(formData, `hours.${day}.closes`),
  }));
}

/** Wraps the same `dayHours` schema `parseBusinessForm` uses under a `hours` key, so a failing issue's path comes
 * out as `hours.{day}.{part}` — the exact field name HoursEditor marks invalid, matching how businessSchema below
 * reports it too. */
const hoursFormSchema = z.object({ hours: z.array(dayHours).length(WEEKDAYS.length) });

/**
 * Just the opening-hours fields, for the "Your details" page's own hours editor, which saves hours on their own
 * rather than as part of the whole business step. Same parsing as the `hours` part of parseBusinessForm.
 */
export function parseHoursForm(formData: FormData): StepParseResult<readonly OpeningHours[]> {
  const result = hoursFormSchema.safeParse({ hours: hoursInputFrom(formData) });
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      success: false,
      message: issue?.message ?? "Check the opening hours and try again.",
      field: issue === undefined ? null : fieldNameOf(issue.path),
    };
  }
  return {
    success: true,
    data: result.data.hours
      .map((day, dayOfWeek) => openingHoursOf(day, dayOfWeek))
      .filter((day): day is OpeningHours => day !== null),
  };
}

const businessSchema = z.object({
  displayName: z
    .string()
    .transform(cleanLine)
    .pipe(z.string().min(1, "Tell us your business name.").max(120, "That business name is too long.")),
  tagline: optionalLine(120, "Keep the tagline to 120 characters."),
  description: z
    .string()
    .transform(cleanMultiline)
    .pipe(z.string().max(600, "Keep the description to 600 characters."))
    .transform((value) => (value === "" ? null : value)),
  phone: optionalPhone,
  email: optionalEmail,
  addressLine1: optionalLine(120, "That address line is too long."),
  addressLine2: optionalLine(120, "That address line is too long."),
  city: optionalLine(80, "That city name is too long."),
  region: optionalLine(80, "That state or region is too long."),
  postalCode: optionalLine(20, "That postal code is too long."),
  country: optionalLine(80, "That country name is too long."),
  serviceAreas: optionalLine(300, "Keep the areas you serve to 300 characters."),
  googleBusinessUrl: googleUrl,
  hours: z.array(dayHours).length(WEEKDAYS.length),
});

/** The form field an issue is about. Phone issues sit one level down, under the number or the country. */
function formFieldOf(path: readonly PropertyKey[]): string | null {
  const [head, part] = path;
  return head === "phone" ? phoneFormField(part) : fieldNameOf(path);
}

/**
 * Step 01. Hours arrive as `hours.{day}.mode`, `hours.{day}.opens` and `hours.{day}.closes` for each weekday, Monday
 * first. A day not sent, or sent as "unset", is left out, so hours can be skipped entirely. Only an open day keeps
 * its times; a closing time before the opening time is a day that closes after midnight.
 */
export function parseBusinessForm(formData: FormData): StepParseResult<BusinessStepInput> {
  const input = {
    displayName: textField(formData, "displayName"),
    description: textField(formData, "description"),
    phone: { country: textField(formData, PHONE_COUNTRY_FIELD), number: textField(formData, "phone") },
    email: textField(formData, "email"),
    googleBusinessUrl: textField(formData, "googleBusinessUrl"),
    ...Object.fromEntries(PROFILE_TEXT_FIELDS.map((name) => [name, textField(formData, name)])),
    hours: hoursInputFrom(formData),
  };

  const result = businessSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      success: false,
      message: issue?.message ?? "Check this step and try again.",
      field: issue === undefined ? null : formFieldOf(issue.path),
    };
  }

  const { hours, ...profile } = result.data;
  return {
    success: true,
    data: {
      profile,
      hours: hours
        .map((day, dayOfWeek) => openingHoursOf(day, dayOfWeek))
        .filter((day): day is OpeningHours => day !== null),
    },
  };
}
