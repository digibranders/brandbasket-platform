import "server-only";
import { isBusinessUrlCode } from "@fynix/db";

/**
 * The website asks for a picture "for a preview" when it draws the owner's page for a business that is not live yet
 * (`?previewFor=<the page's address code>`): the picture is then served on the strength of belonging to that business,
 * not of its page being approved (lib/server/live-preview.ts). The website only asks when the owner's signed preview link
 * is the page the request came from.
 */
export function previewCodeOf(request: Request): string | null {
  const code = new URL(request.url).searchParams.get("previewFor");
  return code !== null && isBusinessUrlCode(code) ? code : null;
}

/** The same answer, kept out of every cache and with nothing to validate it by: a preview shows what is not public. */
export function privately(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("ETag");
  return new Response(response.body, { status: response.status, headers });
}
