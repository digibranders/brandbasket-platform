import { ACCOUNT_CLOSURE_GRACE_DAYS } from "./account-closure-grace";
import { ACCOUNT_CLOSED_NOTICE } from "./account-settings-form";

/** What the page says after an account action that ends at sign-in. Fixed messages: the query only picks one. */
const NOTICES: Readonly<Record<string, string>> = {
  "password-changed": "Your password is changed. Sign in with the new one.",
  [ACCOUNT_CLOSED_NOTICE]:
    `Your account is closed. Your data is kept for ${ACCOUNT_CLOSURE_GRACE_DAYS} days in case you change your mind: sign in again before then to restore it.`,
};

export function loginNotice(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value) ? NOTICES[value] : undefined;
}
