import { z } from "zod";
import { newPasswordSchema } from "@/lib/setup-form";

/*
 * Getting back into an account, and proving an email address is its owner's: the forms behind /forgot-password and
 * /reset-password/<token>, and the addresses the emails link to. Browser-safe, so the form components share the limits.
 */

export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** The page a reset email opens. The token is one path segment; it is random letters and digits. */
export function resetPasswordPath(token: string): string {
  return `/reset-password/${encodeURIComponent(token)}`;
}

/** The page a confirmation email opens. The token is a signed value with dots in it, so it is encoded. */
export function confirmEmailPath(token: string): string {
  return `/confirm-email/${encodeURIComponent(token)}`;
}

const resetSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

/**
 * The form holds what was typed itself (its inputs are controlled), so a state carries only where the person is. An
 * address is sent a link (`sent`) whether or not it has an account.
 */
export type ForgotPasswordFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  /** Said whether or not the address has an account, so the form never tells a stranger which addresses do. */
  | { readonly status: "sent"; readonly email: string };

export const initialForgotPasswordState: ForgotPasswordFormState = { status: "idle" };

export type ResetPasswordFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  /** The link is used up, expired or never existed: the form is replaced by the way to ask for a new one. */
  | { readonly status: "dead-link" };

export const initialResetPasswordState: ResetPasswordFormState = { status: "idle" };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export type NewPasswordParseResult =
  | { readonly success: true; readonly password: string }
  | { readonly success: false; readonly message: string };

/** The new password, typed twice: at least the minimum length, and the same both times. */
function parseNewPassword(formData: FormData): NewPasswordParseResult {
  const result = resetSchema.safeParse({
    password: textValue(formData, "password"),
    confirmPassword: textValue(formData, "confirmPassword"),
  });
  if (!result.success) return { success: false, message: result.error.issues[0]?.message ?? "Check the form and try again." };
  return { success: true, password: result.data.password };
}

export type ResetParseResult =
  | { readonly success: true; readonly token: string; readonly password: string }
  | { readonly success: false; readonly message: string };

export function parseResetPasswordForm(formData: FormData): ResetParseResult {
  const token = textValue(formData, "token");
  if (token === "" || token.length > 200) {
    return { success: false, message: "This link is incomplete. Open the link from your email again." };
  }
  const password = parseNewPassword(formData);
  if (!password.success) return password;
  return { success: true, token, password: password.password };
}
