/**
 * The Review tab's "Verify my business" form (lib/server/owner-verification.ts does the work): its state, how its
 * code is read from the form, and what it says when something goes wrong. Browser-safe: no server imports.
 */
import { isOtpCode } from "@fynix/shared/lib/appointments/otp";

export type VerifyBusinessState =
  | { readonly status: "idle" }
  /** A code was asked for: `texted` is false when none was sent (the bypass is on). */
  | { readonly status: "sent"; readonly otpId: string; readonly phoneHint: string; readonly texted: boolean }
  /** `step` says where the owner is left: `send` (ask for a code again) or still on the code they were typing (`texted`: whether a code really went to their phone). */
  | { readonly status: "error"; readonly message: string; readonly phoneHint?: string; readonly step: "send" | { readonly otpId: string; readonly texted: boolean; readonly phoneHint: string } };

export const initialVerifyBusinessState: VerifyBusinessState = { status: "idle" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CodeFromForm =
  | { readonly ok: true; readonly value: { readonly otpId: string; readonly code: string } }
  | { readonly ok: false; readonly message: string };

/** The step's id and the six digits typed, spaces ignored. */
export function codeFromForm(formData: FormData): CodeFromForm {
  const otpId = formData.get("otpId");
  const code = formData.get("code");
  if (typeof otpId !== "string" || !UUID.test(otpId)) return { ok: false, message: "That didn't work. Ask for a new code." };
  const digits = typeof code === "string" ? code.replace(/\s+/g, "") : "";
  if (!isOtpCode(digits)) return { ok: false, message: "Enter the 6 digits." };
  return { ok: true, value: { otpId, code: digits } };
}

export type VerifyProblem =
  | { readonly kind: "wrong_code"; readonly triesLeft: number | null }
  | { readonly kind: "expired" }
  | { readonly kind: "limited" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" }
  | { readonly kind: "invalid"; readonly message: string };

/** What to tell the owner when asking for or checking a code did not work. */
export function verifyMessage(problem: VerifyProblem): string {
  switch (problem.kind) {
    case "wrong_code":
      if (problem.triesLeft === null) return "Enter the 6 digits.";
      return `That code isn't right. You have ${problem.triesLeft} ${problem.triesLeft === 1 ? "try" : "tries"} left.`;
    case "expired":
      return "That code has run out. Ask for a new code.";
    case "limited":
      return "Too many tries. Please try again in a while.";
    case "unavailable":
      return "We can't send codes right now. Please try again later.";
    case "failed":
      return "Something went wrong. Please try again in a moment.";
    case "invalid":
      return problem.message;
  }
}
