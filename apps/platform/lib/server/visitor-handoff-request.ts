import type { SessionUser } from "@brandbasket/shared/lib/access";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { REVIEWER_NAME_MAX_LENGTH, type VisitorHandoffResponse, type VisitorSessionPayload } from "@/lib/directory-api";
import { ownerCorsHeaders, websiteOriginAllowed } from "@/lib/owner-replies";

/**
 * The HTTP side of `GET /api/directory-account/visitor` (contract: lib/directory-api.ts, VISITOR_HANDOFF_PATH). A person
 * signed in to the dashboard who opens a review or comment form on the website should not be asked for the name and
 * number their account already holds. The website's page asks, from the person's own browser and with the dashboard's
 * session cookie, and the platform answers with the same visitor session a confirmed code would have opened, but only
 * for an account whose number a code has already proven (SessionUser.phone). Checks, in this order:
 *
 * 1. the method, or 405 (an OPTIONS preflight is answered at once)
 * 2. the request's Origin is the website's own (or its www twin), or 403: a page on any other site cannot make the browser hand over a session
 * 3. who is signed in: nobody, or an account with no proven number, is simply not a visitor (200, `visitor: null`)
 *
 * Nothing here reads a database: the session reader and the visitor account are injected, so it is tested without one.
 */

export interface VisitorHandoffDeps {
  /** The website's own origin: the only page whose browser may call this route. */
  readonly websiteOrigin: string;
  readonly getSessionUser: () => Promise<SessionUser | null>;
  /** Opens (or finds) the visitor account of a proven number; undefined when it could not be opened. */
  readonly startVisitor: (phone: string, name: string, now: Date) => Promise<VisitorSessionPayload | undefined>;
  readonly now: () => Date;
}

function reply(request: Request, websiteOrigin: string, status: number, body: VisitorHandoffResponse | null): Response {
  const headers = {
    ...ownerCorsHeaders(request.headers.get("origin"), websiteOrigin),
    "Cache-Control": "no-store",
    ...(body === null ? {} : { "Content-Type": "application/json" }),
  };
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function error(code: "invalid" | "unavailable" | "failed", message: string): VisitorHandoffResponse {
  return { status: "error", code, message, field: null };
}

/** The name a form will post under: the account's own, cleaned and cut to what a review's name may be. */
function visitorNameOf(user: SessionUser): string {
  return Array.from(cleanLine(user.name)).slice(0, REVIEWER_NAME_MAX_LENGTH).join("").trim();
}

export async function handleVisitorHandoffRequest(request: Request, deps: VisitorHandoffDeps): Promise<Response> {
  const { websiteOrigin } = deps;
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    const allowed = websiteOriginAllowed(origin, websiteOrigin);
    return new Response(null, { status: allowed ? 204 : 403, headers: { ...ownerCorsHeaders(origin, websiteOrigin), "Cache-Control": "no-store" } });
  }
  if (request.method !== "GET") return reply(request, websiteOrigin, 405, error("invalid", "Method not allowed."));
  if (!websiteOriginAllowed(origin, websiteOrigin)) return reply(request, websiteOrigin, 403, error("unavailable", "This request is not allowed from here."));

  const user = await deps.getSessionUser();
  const name = user === null ? "" : visitorNameOf(user);
  // Nobody signed in, an account with no proven number, or one with no usable name: not a visitor, and not an error.
  if (user === null || user.phone === null || name === "") return reply(request, websiteOrigin, 200, { status: "ok", visitor: null });

  const visitor = await deps.startVisitor(user.phone, name, deps.now());
  if (visitor === undefined) return reply(request, websiteOrigin, 500, error("failed", "We couldn't sign you in on the website. Please try again."));
  return reply(request, websiteOrigin, 200, { status: "ok", visitor });
}
