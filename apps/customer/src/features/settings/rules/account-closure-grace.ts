/**
 * How long a closed account waits before its data is erased, for the copy in the browser. The database's own constant
 * (ACCOUNT_CLOSURE_GRACE_DAYS in packages/db) is the one that counts; account-closure-grace.test.ts keeps the two equal.
 * A runtime import of the db package here would pull the database into the browser.
 */
export const ACCOUNT_CLOSURE_GRACE_DAYS = 30;
