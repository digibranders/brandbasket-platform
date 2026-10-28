import "server-only";
import { handleHit, handleHitPreflight } from "@/lib/server/site-hit-handler";
import { realHitDeps } from "@/lib/server/site-hit-deps";

/**
 * `POST /api/t`: the first-party tracking script on a customer's website reports a page view, a tap or a form send.
 * The public site key in the body names the business; nothing in the body is a secret and none of it is believed beyond
 * that. The decisions live in lib/server/site-hit-handler.ts and the connections in lib/server/site-hit-deps.ts.
 */

export function OPTIONS(): Response {
  return handleHitPreflight();
}

export function POST(request: Request): Promise<Response> {
  return handleHit(request, realHitDeps());
}
