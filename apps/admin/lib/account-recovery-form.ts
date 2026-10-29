import { passwordPolicyProblem } from "@brandbasket/auth/password-policy";
import { requiredEmail } from "@brandbasket/shared/lib/validation/contact";

export type ForgotPasswordFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly email: string }
  | { readonly status: "sent"; readonly email: string };

export type ResetPasswordFormState =
  | { readonly status: "idle" | "dead-link" }
  | { readonly status: "error"; readonly message: string };

export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function parseRecoveryEmail(data: FormData):
  | { readonly success: true; readonly email: string }
  | { readonly success: false; readonly message: string } {
  const result = requiredEmail("Enter your staff email address.").safeParse(formText(data, "email"));
  return result.success
    ? { success: true, email: result.data }
    : { success: false, message: result.error.issues[0]?.message ?? "Enter your staff email address." };
}

export function parseResetPasswordForm(data: FormData):
  | { readonly success: true; readonly token: string; readonly password: string }
  | { readonly success: false; readonly message: string } {
  const token = formText(data, "token");
  if (token.trim() === "" || token.length > 200) return { success: false, message: "This link is incomplete. Open the link from your email again." };
  const password = formText(data, "password");
  const problem = passwordPolicyProblem(password);
  if (problem !== null) return { success: false, message: problem };
  if (password !== formText(data, "confirmPassword")) return { success: false, message: "Both passwords must match." };
  return { success: true, token, password };
}

export function resetPasswordPath(token: string): string {
  return `/reset-password/${encodeURIComponent(token)}`;
}
