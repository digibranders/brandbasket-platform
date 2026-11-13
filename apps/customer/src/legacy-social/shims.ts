/*
 * The few things the copied Social media screens took from the old app's own modules, kept here so the copy needs no other change.
 * Everything under src/legacy-social is the old Social media page, copied as it was (a lint exemption covers this folder).
 */

/** The brand's time zone: India. */
export const BRAND_TIME_ZONE = "Asia/Kolkata";

/** Where a new request is opened, and the paths the old links used. */
export const REQUESTS_PATH = "/requests";
export const ASK_FOR_A_CHANGE_PATH = "/requests?new=1";

/** A new request, opened on Social media and naming one post. */
export function requestChangeHref(post: { readonly id: string }): string {
  return `${ASK_FOR_A_CHANGE_PATH}&kind=social&about=${post.id}`;
}
