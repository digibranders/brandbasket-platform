/**
 * Where an affiliate's own pages live on the customer app. Shared so the staff console, which builds the login link it
 * hands to an affiliate, and the customer app, which serves it, can never disagree about the address.
 */
export const AFFILIATE_PATH = "/affiliate";

/** How long a login link works. Long enough for a link sent over WhatsApp and opened days later. */
export const AFFILIATE_LOGIN_LINK_DAYS = 7;

/** The address of the page an affiliate opens to choose a password. The token is URL-safe, but encoded all the same. */
export function affiliateSetupPath(token: string): string {
  return `${AFFILIATE_PATH}/setup/${encodeURIComponent(token)}`;
}
