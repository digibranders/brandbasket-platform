import { createHmac } from "node:crypto";

/*
 * The link to the live preview inside the dashboard: the business's own page on the website, drawn with what the owner
 * has typed but not saved. The website checks the link with the secret the two share (LEADS_API_TOKEN) and refuses
 * one that is not ours, so the preview, which can show any text under the website's name, is only ever opened for the
 * signed-in owner of that business. The website's copy of this signature is lib/preview-token.ts there.
 */

/** How long a link works. A dashboard page left open longer shows a notice asking for a reload. */
export const PREVIEW_LINK_SECONDS = 4 * 60 * 60;

/** HMAC-SHA256, base64url, of the business's URL code and the second the link stops working. */
export function previewSignature(secret: string, code: string, expires: number): string {
  return createHmac("sha256", secret).update(`preview-v1.${code}.${String(expires)}`).digest("base64url");
}

/** The preview's address on the website: /preview/business/<code> with when it stops working and its signature. */
export function previewLink(input: { readonly websiteOrigin: string; readonly code: string; readonly secret: string; readonly now: Date }): string {
  const expires = Math.floor(input.now.getTime() / 1000) + PREVIEW_LINK_SECONDS;
  const query = new URLSearchParams({ e: String(expires), s: previewSignature(input.secret, input.code, expires) });
  return `${input.websiteOrigin}/preview/business/${input.code}?${query.toString()}`;
}
