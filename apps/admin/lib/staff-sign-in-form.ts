import type { SignInFormState } from "@brandbasket/shared/lib/sign-in-form";

/** What the password step answers: the usual sign-in states, or the next step once the password was right. */
export type StaffSignInFormState =
  | SignInFormState
  | { readonly status: "code"; readonly email: string; readonly otpId: string };

export type StaffCodeFormState =
  | { readonly status: "idle" }
  /** `restart` is true when the code cannot be tried again and the password has to be entered anew. */
  | { readonly status: "error"; readonly message: string; readonly restart: boolean };

/** How long the emailed code works, as the page says it. Kept equal to STAFF_SIGN_IN_CODE_TTL_SECONDS by a test. */
export const CODE_VALID_MINUTES = 5;

export const initialStaffCodeState: StaffCodeFormState = { status: "idle" };

export interface StaffCodeInput {
  readonly otpId: string;
  /** Digits as typed, without the spaces people put in them. */
  readonly code: string;
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function parseStaffCodeForm(data: FormData): StaffCodeInput {
  return { otpId: text(data, "otpId").trim(), code: text(data, "code").replace(/\s+/g, "") };
}

export function wrongCodeMessage(triesLeft: number | null): string {
  if (triesLeft === null) return "Enter the 6-digit code from your email.";
  return `That code isn’t right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

export const CODE_EXPIRED_MESSAGE = "That code has expired. Sign in again to get a new one.";
