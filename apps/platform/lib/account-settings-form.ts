import { z } from "zod";
import { DELETE_CONFIRMATION_WORD, EXIT_COMMENT_MAX_LENGTH, isExitReason } from "@firstfold/shared/lib/account-exit";
import type { AccountExitReason } from "@firstfold/db";
import { SETUP_PASSWORD_MIN_LENGTH } from "@/lib/setup-form";

/*
 * The forms on the Settings page that act on the signed-in account: changing the password, and the steps of deleting
 * the account. Browser-safe, so the form components and the server actions share the same limits and messages.
 */

export const DELETE_ACCOUNT_PATH = "/settings/delete";

/** Where an account that asked to be deleted lands when it signs in: the choice to restore it, or leave it be. */
export const RESTORE_ACCOUNT_PATH = "/restore-account";

/** What the sign-in page says after an account was closed. Fixed text: the query only picks it. */
export const ACCOUNT_CLOSED_NOTICE = "account-closed";

const MAX_PASSWORD_LENGTH = 128;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Changing the password. `changed` stays on the form so it can say so; the other sessions are signed out. */
export type ChangePasswordFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "changed" }
  | { readonly status: "changed-revoke-failed" };

export type RevokeOtherSessionsState =
  | { readonly status: "idle" }
  | { readonly status: "revoked" }
  | { readonly status: "error"; readonly message: string };

export const initialRevokeOtherSessionsState: RevokeOtherSessionsState = { status: "idle" };

export const initialChangePasswordState: ChangePasswordFormState = { status: "idle" };

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(MAX_PASSWORD_LENGTH, "That password is too long."),
    newPassword: z
      .string()
      .min(SETUP_PASSWORD_MIN_LENGTH, `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, "That password is too long."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Both new passwords must match.",
    path: ["confirmPassword"],
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "Choose a password you haven’t used here before.",
    path: ["newPassword"],
  });

export type ChangePasswordParseResult =
  | { readonly success: true; readonly currentPassword: string; readonly newPassword: string }
  | { readonly success: false; readonly message: string };

export function parseChangePasswordForm(formData: FormData): ChangePasswordParseResult {
  const result = changePasswordSchema.safeParse({
    currentPassword: textValue(formData, "currentPassword"),
    newPassword: textValue(formData, "newPassword"),
    confirmPassword: textValue(formData, "confirmPassword"),
  });
  if (!result.success) return { success: false, message: result.error.issues[0]?.message ?? "Check the form and try again." };
  return { success: true, currentPassword: result.data.currentPassword, newPassword: result.data.newPassword };
}

/** What the person said about leaving: the reason they chose and, optionally, a few words. */
export interface ExitDetails {
  readonly reason: AccountExitReason;
  /** Trimmed; null when they typed nothing. */
  readonly comment: string | null;
}

export type ExitDetailsParseResult =
  | { readonly success: true; readonly details: ExitDetails }
  | { readonly success: false; readonly message: string };

export function parseExitDetails(formData: FormData): ExitDetailsParseResult {
  const reason = formData.get("reason");
  if (!isExitReason(reason)) return { success: false, message: "Choose the reason closest to yours." };
  const comment = textValue(formData, "comment").trim();
  if (comment.length > EXIT_COMMENT_MAX_LENGTH) {
    return { success: false, message: `Keep it to ${EXIT_COMMENT_MAX_LENGTH} characters or fewer.` };
  }
  return { success: true, details: { reason, comment: comment === "" ? null : comment } };
}

export type DeleteParseResult =
  | { readonly success: true; readonly details: ExitDetails; readonly password: string }
  | { readonly success: false; readonly message: string };

/** The last step: the reason and comment again, the word DELETE typed out, and the account's password. */
export function parseDeleteForm(formData: FormData): DeleteParseResult {
  const details = parseExitDetails(formData);
  if (!details.success) return details;
  if (textValue(formData, "confirmation").trim() !== DELETE_CONFIRMATION_WORD) {
    return { success: false, message: `Type ${DELETE_CONFIRMATION_WORD} in capitals to confirm.` };
  }
  const password = textValue(formData, "password");
  if (password === "") return { success: false, message: "Enter your password to confirm it’s you." };
  if (password.length > MAX_PASSWORD_LENGTH) return { success: false, message: "That password is too long." };
  return { success: true, details: details.details, password };
}

/** The stay offer as the page shows it, resolved on the server for a reason. */
export interface RetentionOfferView {
  readonly percent: number;
  /** What each month costs now, tax included, formatted; null when the plan has no price to show. */
  readonly currentPrice: string | null;
  /** What each month costs after the offer, tax included, formatted. */
  readonly newPrice: string;
}

/** The server's answer to "what do you offer someone leaving for this reason?". */
export type OfferLookupState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "offer"; readonly offer: RetentionOfferView }
  | { readonly status: "no-offer" };

export const initialOfferLookupState: OfferLookupState = { status: "idle" };

/** Taking the stay offer: it ends the flow on this page with the account kept, or says why it could not. */
export type ClaimOfferState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "kept"; readonly newPrice: string };

export const initialClaimOfferState: ClaimOfferState = { status: "idle" };

/** The last step: only an error comes back, because success signs the person out and sends them away. */
export type DeleteAccountState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: "password" | null };

export const initialDeleteAccountState: DeleteAccountState = { status: "idle" };
