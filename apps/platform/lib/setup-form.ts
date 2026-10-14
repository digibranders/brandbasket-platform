import { z } from "zod";

/**
 * Matches PASSWORD_MIN_LENGTH in @fynix/auth (also 10). Kept here, rather than imported, so this module stays
 * browser-safe: it is used by the client SetupForm component, and @fynix/auth pulls in server-only dependencies.
 * lib/server/setup.ts sees both constants and fails at module load if they ever drift apart.
 */
export const SETUP_PASSWORD_MIN_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Tell us your name.").max(120, "That name is too long."),
    password: z
      .string()
      .min(SETUP_PASSWORD_MIN_LENGTH, `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, "That password is too long."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

/** What the tick box sends when it is ticked: the person agreed to the Terms and the Privacy Notice. */
export const SETUP_AGREE_FIELD = "agree";
export const SETUP_AGREE_VALUE = "yes";
/** Said when an account is about to be made and the box is not ticked. */
export const SETUP_AGREE_MESSAGE = "Tick the box to agree to the Terms and Privacy Notice.";

export interface SetupInput {
  readonly name: string;
  readonly password: string;
  readonly mode?: "create" | "verify-existing";
  /** Present, and true, only when the box was ticked. The server asks for it where a new account is made. */
  readonly agreed?: true;
}

export type SetupField = "name" | "password" | "confirmPassword" | "agree";

export type SetupFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly mode?: "verify-existing"; readonly field?: SetupField };

export const initialSetupFormState: SetupFormState = { status: "idle" };

export type SetupParseResult =
  | { readonly success: true; readonly data: SetupInput }
  | { readonly success: false; readonly message: string; readonly field: SetupField };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseSetupForm(formData: FormData): SetupParseResult {
  const existing = formData.get("mode") === "verify-existing";
  const schema = existing
    ? z.object({
      name: setupSchema.shape.name,
      password: z.string().min(1, "Enter your account’s password.").max(MAX_PASSWORD_LENGTH, "That password is too long."),
    })
    : setupSchema;
  const result = schema.safeParse({
    name: textValue(formData, "name"),
    password: textValue(formData, "password"),
    confirmPassword: textValue(formData, "confirmPassword"),
  });
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path[0];
    return { success: false, message: issue?.message ?? "Check the form and try again.", field: path === "name" || path === "confirmPassword" ? path : "password" };
  }
  const agreed = textValue(formData, SETUP_AGREE_FIELD) === SETUP_AGREE_VALUE;
  return {
    success: true,
    data: {
      name: result.data.name,
      password: result.data.password,
      ...(existing ? { mode: "verify-existing" as const } : {}),
      ...(agreed ? { agreed: true as const } : {}),
    },
  };
}
