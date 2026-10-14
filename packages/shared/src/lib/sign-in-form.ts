import { z } from "zod";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address.")
    .max(MAX_EMAIL_LENGTH, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password.").max(MAX_PASSWORD_LENGTH, "That password is too long."),
});

export type SignInInput = z.output<typeof signInSchema>;

export type SignInFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly email: string };

export const initialSignInState: SignInFormState = { status: "idle" };

export type SignInParseResult =
  | { readonly success: true; readonly data: SignInInput }
  | { readonly success: false; readonly message: string; readonly email: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseSignInForm(formData: FormData): SignInParseResult {
  const email = textValue(formData, "email");
  const result = signInSchema.safeParse({ email, password: textValue(formData, "password") });
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    message: result.error.issues[0]?.message ?? "Check your email and password.",
    email: email.trim(),
  };
}

/** What was typed in the sign-in form's identifier field, trimmed, so a refusal that comes before parsing can give it back. */
export function typedSignInIdentifier(formData: FormData): string {
  return textValue(formData, "email").trim();
}
