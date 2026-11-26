/*
 * Words the one-screen checkout shares between its server action and its screen. A "use server" file may export functions
 * only, so they live here, where the browser can read them too.
 */

/** The refusal under Email when the address already has an account. */
export const CHECKOUT_ACCOUNT_EXISTS_MESSAGE = "This email already has a Brandbasket account.";

/** The refusal at the Terms box, the same words on the screen (before posting) and on the server. */
export const CHECKOUT_AGREE_MESSAGE = "Tick the box to agree to the Terms and Privacy Notice.";
