import { z } from "zod";
import type { OtpRetry } from "@/lib/auth-retry";
import { OTP_LENGTH } from "@fynix/shared/lib/appointments/otp";
import { cleanLine } from "@fynix/shared/lib/validation/text";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";

/*
 * The sign-up form (/login, Create account): browser-safe, so the form component can share its limits. An owner gives
 * their name, their email address and a password; we email the address a code, and the account is opened once they
 * enter it. So the form is sent twice: first with no code (send me one), then with the code and the one it answers.
 *
 * Before any of that the owner picks a plan (docs/superpowers/specs/2026-10-07-care-plan-design.md): the free listing,
 * the Care plan or the Premium membership, all shown at once. The answer travels with the form as `choice`. (The first
 * version of the page asked "Do you have your own website?" first; that question is gone.)
 *
 * The business is not in the directory yet: it adds itself on the Listing page after signing up. The server
 * (lib/server/listing-account.ts) checks the address.
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
const CODE_MESSAGE = `Enter a ${OTP_LENGTH}-digit code.`;

const accountSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(JOIN_NAME_MAX_LENGTH, "That name is too long."),
  password: z
    .string()
    .min(SETUP_PASSWORD_MIN_LENGTH, `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters for the password.`)
    .max(MAX_PASSWORD_LENGTH, "That password is too long."),
});

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

/** The code the owner typed, and the id of the one we emailed that it answers. */
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

/** How the owner is reached, and how they sign in. */
export interface JoinContact {
  /** Trimmed and lowercased, as accounts are stored. */
  readonly email: string;
}

type JoinAccount = JoinAccountBase & JoinContact;

/** A new account and the business it opens with: the business picks its category and area after signing in. */
export type JoinInput = JoinAccount & {
  /**
   * The business's name, asked only of an owner who chose Care or Premium: they pay before anything else, and the
   * checkout, the receipt and our team must name the business, not its owner. Null for a free sign-up, which names
   * the business when it is added on the Listing page.
   */
  readonly businessName: string | null;
};

/** The code step: which code the form is waiting for, and the address it went to, mostly hidden. */
export interface JoinCodeStep {
  readonly otpId: string;
  /** The address the code went to ("m•••@example.com"), with most of it hidden. */
  readonly emailHint: string;
  /** False only with the local bypass on (EMAIL_CODE_BYPASS): the code is in the outbox, but the form asks for any six digits. */
  readonly confirmRequired: boolean;
}

/**
 * The form holds what was typed itself (its inputs are controlled), so a state carries only where the owner is:
 * `code` once a code has been emailed, and an error says whether it happened on the code step (`otp` kept) or before.
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

/** The form's address, lowercase, or the message to put right. */
function readContact(formData: FormData): { readonly success: true; readonly contact: JoinContact } | { readonly success: false; readonly message: string } {
  const email = emailSchema.safeParse(textValue(formData, "email"));
  return email.success ? { success: true, contact: { email: email.data } } : { success: false, message: firstMessage(email.error) };
}

/** What the form was sent with: the plan, the owner's details and, on the code step (an `otpId`), the code. */
export function parseJoinForm(formData: FormData): JoinParseResult {
  const choice = readJoinChoice(formData.get("choice"));
  if (choice === null) return { success: false, message: CHOICE_MESSAGE };

  const basics = accountSchema.safeParse({ name: textValue(formData, "name"), password: textValue(formData, "password") });
  // The name is asked first, then how to reach them, then the password: the order they appear on the form.
  const contact = readContact(formData);
  if (!basics.success && (basics.error.issues[0]?.path[0] === "name" || contact.success)) return { success: false, message: firstMessage(basics.error) };
  if (!contact.success) return { success: false, message: contact.message };
  if (!basics.success) return { success: false, message: firstMessage(basics.error) };
  const account = { data: { ...basics.data, ...contact.contact } };

  if (textValue(formData, AGREE_FIELD) !== AGREE_VALUE) return { success: false, message: AGREE_MESSAGE };

  const code = readCode(formData);
  if (!code.ok) return { success: false, message: CODE_MESSAGE };

  // One clean line; a free sign-up never asks for it, so anything it sent here is ignored.
  const typed = cleanLine(textValue(formData, "businessName")).replace(/\s+/g, " ");
  if (!isPaidChoice(choice)) return { success: true, data: { choice, businessName: null, ...account.data, agreed: true, code: code.code } };
  if (typed === "") return { success: false, message: NEW_BUSINESS_NAME_MESSAGE };
  if (typed.length > JOIN_BUSINESS_NAME_MAX_LENGTH) return { success: false, message: "That business name is too long." };
  return { success: true, data: { choice, businessName: typed, ...account.data, agreed: true, code: code.code } };
}
