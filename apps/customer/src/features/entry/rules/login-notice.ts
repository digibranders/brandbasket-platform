/** Set by the account closing flow when it signs the owner out (apps/platform lib/account-settings-form.ts). */
export const ACCOUNT_CLOSED_NOTICE = "account-closed";
/**
 * How long a closed account waits before its data is erased, for the copy in the browser. The database's own constant
 * (ACCOUNT_CLOSURE_GRACE_DAYS in packages/db) is the one that counts; login-notice.test.ts keeps the two equal.
 */
const ACCOUNT_CLOSURE_GRACE_DAYS = 30;

/** What the page says after an account action that ends at sign-in. Fixed messages: the query only picks one. */
const NOTICES: Readonly<Record<string, string>> = {
  "password-changed": "Your password is changed. Sign in with the new one.",
  [ACCOUNT_CLOSED_NOTICE]:
    `Your account is closed. Your data is kept for ${ACCOUNT_CLOSURE_GRACE_DAYS} days in case you change your mind: sign in again before then to restore it.`,
};

export function loginNotice(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value) ? NOTICES[value] : undefined;
}
