import { z } from "zod";
import type { OtpRetry } from "@/lib/auth-retry";
import { OTP_LENGTH } from "@firstfold/shared/lib/appointments/otp";
import { cleanLine } from "@firstfold/shared/lib/validation/text";
import { DIRECTORY_CLAIM_ID_PARAM, DIRECTORY_CLAIM_SIGNATURE_PARAM, LISTING_KEY_PATTERN, PLACE_ID_PATTERN } from "@/lib/directory-api";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";

/*
 * The sign-up form (/login, Create account): browser-safe, so the form component can share its limits. An owner gives
 * their name, their mobile number and a password; we text the number a code, and the account is opened once they
 * enter it. So the form is sent twice: first with no code (send me one), then with the code and the one it answers.
 * Under Fynix (lib/brand.ts signUpWith) the owner gives an email address instead of a mobile number and the code is
 * emailed to it; everything else is the same.
 *
 * Before any of that the owner picks a plan (docs/superpowers/specs/2026-10-07-care-plan-design.md): the free listing,
 * the Care plan or the Premium membership, all shown at once. The answer travels with the form as `choice`. (The first
 * version of the page asked "Do you have your own website?" first; that question is gone.)
 *
 * It is reached two ways: from a business's page on Firstfold Local, which names the listing being claimed, or with
 * no listing at all by a business that is not in the directory yet, which adds itself on the Listing page after
 * signing up. The server (lib/server/listing-account.ts) parses the phone number and checks the claim link.
 */

const MAX_PASSWORD_LENGTH = 128;
export const JOIN_NAME_MAX_LENGTH = 60;
export const JOIN_BUSINESS_NAME_MAX_LENGTH = 200;

/**
 * What the owner wants from the account, in the database's words (`signup_choice`): only the free listing, the Care
 * plan, or the Premium membership. The database also holds `own_website`, from the old question; it is never offered.
 */
export const JOIN_CHOICES = ["listing_only", "care", "premium"] as const;
export type JoinChoice = (typeof JOIN_CHOICES)[number];
const CHOICE_MESSAGE = "Choose a plan to continue.";

/** The choices that pay before the dashboard opens: they name the business, and they are held on the plan's page. */
export function isPaidChoice(choice: JoinChoice): boolean {
  return choice !== "listing_only";
}

/** The choice a form or a link names, or null for anything else. */
export function readJoinChoice(value: unknown): JoinChoice | null {
  return JOIN_CHOICES.find((choice) => choice === value) ?? null;
}

/** The one thing the tick box can say: the owner agreed to the Terms and the Privacy Notice (proof is kept in consent_records). */
export const AGREE_FIELD = "agree";
export const AGREE_VALUE = "yes";
const AGREE_MESSAGE = "Tick the box to agree to the Terms and Privacy Notice.";

const CODE = new RegExp(`^[0-9]{${OTP_LENGTH}}$`);
/** Says nothing about a text: while SIGNUP_OTP_BYPASS is on (lib/server/env.ts) no code is sent. */
const CODE_MESSAGE = `Enter a ${OTP_LENGTH}-digit code.`;

const accountSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(JOIN_NAME_MAX_LENGTH, "That name is too long."),
  password: z
    .string()
    .min(SETUP_PASSWORD_MIN_LENGTH, `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters for the password.`)
    .max(MAX_PASSWORD_LENGTH, "That password is too long."),
});

/** What an account is opened with, and so what its code goes to (lib/brand.ts signUpWith). */
export type JoinContactKind = "phone" | "email";

const phoneSchema = z.string().trim().min(1, "Enter your mobile number.").max(40, "That phone number is too long.");

/** The longest an email address can be (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;
const MISSING_EMAIL_MESSAGE = "Enter your email address.";
const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";
const emailSchema = z
  .string()
  .trim()
  .min(1, MISSING_EMAIL_MESSAGE)
  .max(MAX_EMAIL_LENGTH, INVALID_EMAIL_MESSAGE)
  .pipe(z.email(INVALID_EMAIL_MESSAGE))
  .transform((email) => email.toLowerCase());

const NEW_BUSINESS_NAME_MESSAGE = "Tell us your business's name.";

const MISSING_BUSINESS_MESSAGE = "This link is missing the business. Open it again from the business's page.";

const claimSchema = z.object({
  businessName: z
    .string()
    .min(1, "This link is missing the business's name. Open it again from the business's page.")
    .max(JOIN_BUSINESS_NAME_MAX_LENGTH, "That business name is too long."),
  /** The website's signature over the business (its key or its id) and its name (lib/directory-api.ts, "A claim link"). */
  signature: z.string().min(1, "This link is incomplete. Open it again from the business's page.").max(100),
});

/** How a claim link names the business: by listing key, or by permanent id (never both). */
const claimBusinessSchema = z.union([
  z.object({ listing: z.string().max(200).regex(LISTING_KEY_PATTERN, MISSING_BUSINESS_MESSAGE), placeId: z.undefined() }),
  z.object({ placeId: z.string().regex(PLACE_ID_PATTERN, MISSING_BUSINESS_MESSAGE), listing: z.undefined() }),
]);

/** The code the owner typed, and the id of the one we texted that it answers. */
export interface JoinCode {
  readonly otpId: string;
  readonly code: string;
}

interface JoinAccountBase {
  readonly choice: JoinChoice;
  readonly name: string;
  readonly password: string;
  /** Always true: a form whose terms box is not ticked is refused before it gets here. */
  readonly agreed: true;
  /** Null the first time the form is sent: send me a code. */
  readonly code: JoinCode | null;
}

/** How the owner is reached, and how they sign in: by mobile number (Firstfold) or by email address (Fynix), never both. */
export type JoinContact =
  | {
      /** As typed: the server reads it as an Indian number unless it starts with a country code. */
      readonly phone: string;
      readonly email?: undefined;
    }
  | {
      /** Trimmed and lowercased, as accounts are stored. */
      readonly email: string;
      readonly phone?: undefined;
    };

type JoinAccount = JoinAccountBase & JoinContact;

/** The business a claim is for: named by its listing key, or by its permanent id, never both. */
export type JoinClaimBusiness =
  | { readonly listing: string; readonly placeId?: undefined }
  | { readonly placeId: string; readonly listing?: undefined };

type JoinClaimBase = JoinAccount & {
  readonly kind: "claim";
  readonly businessName: string;
  /** Proves the business (its key or its id) and its name came from the directory's own page; checked on the server. */
  readonly signature: string;
};

/** Claiming a listing the directory already has. */
export type JoinClaimInput = JoinClaimBase & JoinClaimBusiness;

/** A business that is not in the directory yet: it picks its category and area after signing in. */
export type JoinNewInput = JoinAccount & {
  readonly kind: "new";
  /**
   * The business's name, asked only of an owner who chose Care or Premium: they pay before anything else, and the
   * checkout, the receipt and our team must name the business, not its owner. Null for a free sign-up, which names
   * the business when it is added on the Listing page.
   */
  readonly businessName: string | null;
};

export type JoinInput = JoinClaimInput | JoinNewInput;

/** The code step: which code the form is waiting for, and the number or address it is for, mostly hidden. */
export interface JoinCodeStep {
  readonly otpId: string;
  /** The number ("•••• 3210") or the address ("m•••@example.com") the code went to, with most of it hidden. */
  readonly phoneHint: string;
  /** Whether the code goes to a number (texted) or an address (emailed). */
  readonly via: JoinContactKind;
  /** False while codes are not being sent (SIGNUP_OTP_BYPASS, EMAIL_CODE_BYPASS): the form then asks for any six digits. */
  readonly texted: boolean;
}

/**
 * The form holds what was typed itself (its inputs are controlled), so a state carries only where the owner is:
 * `code` once a code has been texted, and an error says whether it happened on the code step (`otp` kept) or before.
 */
export type JoinFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly retry?: OtpRetry; readonly otp: JoinCodeStep | null }
  | { readonly status: "code"; readonly otp: JoinCodeStep };

export const initialJoinFormState: JoinFormState = { status: "idle" };

export type JoinParseResult = { readonly success: true; readonly data: JoinInput } | { readonly success: false; readonly message: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

/** Null with no `otpId` (the first send); the code with its spaces dropped, or a message when it is not six digits. */
function readCode(formData: FormData): { readonly ok: true; readonly code: JoinCode | null } | { readonly ok: false } {
  const otpId = textValue(formData, "otpId").trim();
  if (otpId === "") return { ok: true, code: null };
  const code = textValue(formData, "code").replace(/\s+/g, "");
  if (otpId.length > 64 || !CODE.test(code)) return { ok: false };
  return { ok: true, code: { otpId, code } };
}

/** The form's number (as typed) or its address (lowercase), whichever the brand opens accounts with. */
function readContact(formData: FormData, kind: JoinContactKind): { readonly success: true; readonly contact: JoinContact } | { readonly success: false; readonly message: string } {
  if (kind === "email") {
    const email = emailSchema.safeParse(textValue(formData, "email"));
    return email.success ? { success: true, contact: { email: email.data } } : { success: false, message: firstMessage(email.error) };
  }
  const phone = phoneSchema.safeParse(textValue(formData, "phone"));
  return phone.success ? { success: true, contact: { phone: phone.data } } : { success: false, message: firstMessage(phone.error) };
}

/**
 * A form with no `listing` or `id` is a new business's; with one, a claim. With an `otpId`, it is the code step.
 * `contact` is what the brand opens accounts with: a mobile number (the default) or an email address.
 */
export function parseJoinForm(formData: FormData, contactKind: JoinContactKind = "phone"): JoinParseResult {
  const choice = readJoinChoice(formData.get("choice"));
  if (choice === null) return { success: false, message: CHOICE_MESSAGE };

  const basics = accountSchema.safeParse({ name: textValue(formData, "name"), password: textValue(formData, "password") });
  // The name is asked first, then how to reach them, then the password: the order they appear on the form.
  const contact = readContact(formData, contactKind);
  if (!basics.success && (basics.error.issues[0]?.path[0] === "name" || contact.success)) return { success: false, message: firstMessage(basics.error) };
  if (!contact.success) return { success: false, message: contact.message };
  if (!basics.success) return { success: false, message: firstMessage(basics.error) };
  const account = { data: { ...basics.data, ...contact.contact } };

  if (textValue(formData, AGREE_FIELD) !== AGREE_VALUE) return { success: false, message: AGREE_MESSAGE };

  const code = readCode(formData);
  if (!code.ok) return { success: false, message: CODE_MESSAGE };

  const listing = textValue(formData, "listing");
  const placeId = textValue(formData, DIRECTORY_CLAIM_ID_PARAM);
  if (listing === "" && placeId === "") {
    // One clean line, like a claimed listing's name; anything a free sign-up sent here is ignored.
    const typed = cleanLine(textValue(formData, "businessName")).replace(/\s+/g, " ");
    if (!isPaidChoice(choice)) return { success: true, data: { kind: "new", choice, businessName: null, ...account.data, agreed: true, code: code.code } };
    if (typed === "") return { success: false, message: NEW_BUSINESS_NAME_MESSAGE };
    if (typed.length > JOIN_BUSINESS_NAME_MAX_LENGTH) return { success: false, message: "That business name is too long." };
    return { success: true, data: { kind: "new", choice, businessName: typed, ...account.data, agreed: true, code: code.code } };
  }

  // A link names the business one way: a form that names it two ways was not made by the website.
  const business = claimBusinessSchema.safeParse({
    listing: listing === "" ? undefined : listing,
    placeId: placeId === "" ? undefined : placeId,
  });
  if (!business.success) return { success: false, message: MISSING_BUSINESS_MESSAGE };
  const claim = claimSchema.safeParse({
    // Carried in the link, but one clean line all the same.
    businessName: cleanLine(textValue(formData, "businessName")).replace(/\s+/g, " "),
    signature: textValue(formData, DIRECTORY_CLAIM_SIGNATURE_PARAM),
  });
  if (!claim.success) return { success: false, message: firstMessage(claim.error) };
  return { success: true, data: { kind: "claim", choice, ...business.data, ...claim.data, ...account.data, agreed: true, code: code.code } };
}
