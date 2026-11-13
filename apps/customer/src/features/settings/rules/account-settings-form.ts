import { PASSWORD_MAX_LENGTH, passwordPolicyProblem } from "@brandbasket/auth/password-policy";
import { DELETE_CONFIRMATION_WORD, EXIT_COMMENT_MAX_LENGTH, EXIT_REASON_ORDER } from "@brandbasket/shared/lib/account-exit";
import { z } from "zod";

/*
 * The forms on Settings that act on the signed-in account: the name, the password, and the steps of deleting the account.
 * Ported from apps/platform lib/account-settings-form.ts. Browser-safe, so the form components and the server actions share
 * the same limits and messages. The old hand-rolled parsers are zod schemas here, read with parseForm (BUILD-RULES rule 5);
 * the messages are the old ones.
 */

export const DELETE_ACCOUNT_PATH = "/settings/delete";

/** What the sign-in page says after an account was closed. Fixed text: the query only picks it. */
export const ACCOUNT_CLOSED_NOTICE = "account-closed";

export const NAME_MAX_LENGTH = 120;

/** A text field the form always sends; a missing one reads as the message, not as a type error. */
const text = (message: string) => z.string({ error: message });

/** A newly chosen password, held to the rule Better Auth also enforces on the server. */
export const newPasswordSchema = text("Choose a new password.").superRefine((password, context) => {
  const problem = passwordPolicyProblem(password);
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});

const currentPasswordSchema = (empty: string) => text(empty).min(1, empty).max(PASSWORD_MAX_LENGTH, "That password is too long.");

/** Changing the password: the current one, the new one typed twice, and not the same as before. */
export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordSchema("Enter your current password."),
    newPassword: newPasswordSchema,
    confirmPassword: text("Type the new password again."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, { message: "Both new passwords must match.", path: ["confirmPassword"] })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "Choose a password you haven’t used here before.",
    path: ["newPassword"],
  });

/** The one profile field a person may change: the name shown on the dashboard and in emails. */
export const profileSchema = z.object({
  name: text("Tell us your name.").trim().min(1, "Tell us your name.").max(NAME_MAX_LENGTH, "That name is too long."),
});

/** What the person said about leaving: the reason they chose and, optionally, a few words. */
export const exitDetailsSchema = z.object({
  reason: z.enum(EXIT_REASON_ORDER, { error: "Choose the reason closest to yours." }),
  comment: z
    .string()
    .trim()
    .max(EXIT_COMMENT_MAX_LENGTH, `Keep it to ${EXIT_COMMENT_MAX_LENGTH} characters or fewer.`)
    .default("")
    // Trimmed; null when they typed nothing.
    .transform((comment) => (comment === "" ? null : comment)),
});

export type ExitDetails = z.output<typeof exitDetailsSchema>;

/** The last step: the reason and comment again, the word DELETE typed out, and the account's password. */
export const deleteAccountSchema = exitDetailsSchema.extend({
  confirmation: text(`Type ${DELETE_CONFIRMATION_WORD} in capitals to confirm.`)
    .trim()
    .refine((typed) => typed === DELETE_CONFIRMATION_WORD, `Type ${DELETE_CONFIRMATION_WORD} in capitals to confirm.`),
  password: currentPasswordSchema("Enter your password to confirm it’s you."),
});
