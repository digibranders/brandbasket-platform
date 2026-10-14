import "server-only";
import { setAccountPassword } from "@fynix/auth";
import { findUserByPhone } from "@fynix/db";
import { clientIpFrom } from "@fynix/shared/lib/client-ip";
import { OTP_LENGTH } from "@fynix/shared/lib/appointments/otp";
import { headers } from "next/headers";
import { parseNewPassword, type ResetCodeStep } from "@/lib/account-recovery-form";
import { confirmAccountOtp, requestAccountOtp, type AccountOtpLimited } from "./account-otp";
import { getAuth } from "./auth";
import { parseAccountIdentifier, type SignInIdentifierMode } from "./customer-sign-in-form";
import { getAppDb } from "./db";

/*
 * Getting back into an account that signs in with a mobile number: a code is texted to the number, and the owner
 * enters it with a new password on the same form (docs/superpowers/specs/2026-09-30-phone-sign-in-design.md). The
 * email way (a one-time link) is lib/server/account-recovery.ts. Nothing here ever says whether a number has an
 * account: a number with none is answered as if a code had been texted, and no code then ever confirms.
 */

const CODE = new RegExp(`^[0-9]{${OTP_LENGTH}}$`);
const CODE_MESSAGE = `Enter the ${OTP_LENGTH}-digit code we texted you.`;
const RUN_OUT_MESSAGE = "That code has run out. Send a new one.";

export type ForgotPasswordRequest =
  | { readonly kind: "email"; readonly email: string }
  | {
      readonly kind: "phone";
      /** E.164. */
      readonly phone: string;
      /** Null the first time the form is sent: text me a code. */
      readonly reset: { readonly otpId: string; readonly code: string; readonly password: string } | null;
    };

export type ForgotPasswordParseResult =
  | { readonly success: true; readonly data: ForgotPasswordRequest }
  | { readonly success: false; readonly message: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * What /forgot-password was sent: an email (send a link), a number (text a code), or a number's code step. A brand that
 * signs in with an email (Fynix) takes an email only: it has no way to text, so a number is asked to be an address.
 */
export function parseForgotPasswordRequest(formData: FormData, mode: SignInIdentifierMode = "phone-or-email"): ForgotPasswordParseResult {
  const identifier = parseAccountIdentifier(textValue(formData, "identifier"), mode);
  if (!identifier.success) return identifier;
  if (mode === "email" && identifier.identifier.kind !== "email") return { success: false, message: "Enter your email address." };
  if (identifier.identifier.kind === "email") return { success: true, data: { kind: "email", email: identifier.identifier.email } };

  const { phone } = identifier.identifier;
  const otpId = textValue(formData, "otpId").trim();
  if (otpId === "") return { success: true, data: { kind: "phone", phone, reset: null } };

  const code = textValue(formData, "code").replace(/\s+/g, "");
  if (otpId.length > 64 || !CODE.test(code)) return { success: false, message: CODE_MESSAGE };
  const password = parseNewPassword(formData);
  if (!password.success) return password;
  return { success: true, data: { kind: "phone", phone, reset: { otpId, code, password: password.password } } };
}

export type PhoneResetCodeOutcome =
  | AccountOtpLimited
  | { readonly kind: "code"; readonly otp: ResetCodeStep }
  | { readonly kind: "refused"; readonly message: string };

/** Texts a reset code to `phone` if an account signs in with it; answered the same way when none does. */
export async function requestPhonePasswordReset(phone: string): Promise<PhoneResetCodeOutcome> {
  const account = await findUserByPhone(getAppDb(), phone);
  const clientIp = clientIpFrom(await headers());
  const outcome = await requestAccountOtp({ purpose: "password_reset", phone, send: account !== null }, clientIp, new Date());
  switch (outcome.kind) {
    case "sent":
      return { kind: "code", otp: { otpId: outcome.otpId, phoneHint: outcome.phoneHint } };
    case "invalid":
      return { kind: "refused", message: outcome.message };
    case "limited":
      return outcome;
    case "unavailable":
      return { kind: "refused", message: "We can't text a code right now. Please try again later." };
    case "failed":
      return { kind: "refused", message: "We couldn't text that number. Try again in a minute." };
  }
}

export type PhonePasswordResetOutcome =
  | AccountOtpLimited
  | { readonly kind: "changed" }
  /** The code was wrong or has run out: the form stays on the code step. */
  | { readonly kind: "wrong-code"; readonly message: string };

/**
 * Sets the new password for the account that signs in with `phone`, once the code texted to it is confirmed, and
 * signs every device out of it.
 */
export async function resetPasswordWithCode(input: {
  readonly phone: string;
  readonly otpId: string;
  readonly code: string;
  readonly password: string;
}): Promise<PhonePasswordResetOutcome> {
  const clientIp = clientIpFrom(await headers());
  const confirmed = await confirmAccountOtp(
    { otpId: input.otpId, code: input.code, purpose: "password_reset", phone: input.phone },
    clientIp,
    new Date(),
  );
  switch (confirmed.kind) {
    case "confirmed":
      break;
    case "wrong_code":
      return {
        kind: "wrong-code",
        message:
          confirmed.triesLeft === null
            ? CODE_MESSAGE
            : `That code isn't right. ${confirmed.triesLeft} ${confirmed.triesLeft === 1 ? "try" : "tries"} left.`,
      };
    case "expired":
      return { kind: "wrong-code", message: RUN_OUT_MESSAGE };
    case "limited":
      return confirmed;
  }

  // A code is only ever texted to a number with an account, so this holds unless the account went in between.
  const account = await findUserByPhone(getAppDb(), input.phone);
  if (account === null) return { kind: "wrong-code", message: RUN_OUT_MESSAGE };
  await setAccountPassword(getAuth(), account.id, input.password);
  return { kind: "changed" };
}
