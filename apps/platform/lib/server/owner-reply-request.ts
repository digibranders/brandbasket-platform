import type { DirectoryNamed, DirectoryRef } from "@brandbasket/db";
import { z } from "zod";
import {
  listingKeySchema,
  ownerReplyEditRequestSchema,
  ownerReplyPostRequestSchema,
  ownerReplyRemoveRequestSchema,
  placeIdSchema,
  type DirectoryError,
  type OwnerAccessResponse,
  type OwnerReplyResponse,
} from "@/lib/directory-api";
import { ownerCorsHeaders, websiteOriginAllowed } from "@/lib/owner-replies";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";
import type { OwnedBusiness } from "./owner-business";
import type { OwnerReplyOutcome } from "./owner-replies";

/**
 * The HTTP side of the routes the website's own page calls from the owner's browser (/api/directory-owner/*): the
 * contract is in lib/directory-api.ts. Unlike the rest of /api/directory, the caller is a person, identified by the
 * dashboard's session cookie rather than the website's token, so the checks are different, in this order:
 *
 * 1. the method, or 405 (an OPTIONS preflight is answered at once)
 * 2. the request's Origin is the website's own, or 403: a page on any other site cannot make the browser act as the owner
 * 3. for a write, a JSON content type (415, which also forces the preflight), a small body (413) and the contract's shape (400)
 * 4. a signed-in caller (401) who is this business's verified owner (403)
 * 5. the work, whose outcome maps to a status
 *
 * Nothing here reads a database: the work and the owner lookup are injected, so it is tested without one.
 */

const MAX_BODY_BYTES = 16 * 1024;

type OwnerOf = Extract<OwnedBusiness, { readonly kind: "owner" }>;

export interface OwnerReplyDeps {
  /** The website's own origin: the only page whose browser may call these routes. */
  readonly websiteOrigin: string;
  readonly getOwner: () => Promise<OwnedBusiness>;
  readonly post: (owner: OwnerOf, input: { readonly reviewId: string; readonly text: string }, now: Date) => Promise<OwnerReplyOutcome>;
  readonly change: (owner: OwnerOf, input: { readonly commentId: string; readonly text: string }, now: Date) => Promise<OwnerReplyOutcome>;
  readonly takeDown: (owner: OwnerOf, input: { readonly commentId: string }, now: Date) => Promise<OwnerReplyOutcome>;
  readonly now: () => Date;
}

export interface OwnerAccessDeps {
  readonly websiteOrigin: string;
  readonly getOwner: () => Promise<OwnedBusiness>;
  /** The business a page names, as the platform knows it (a listing key becomes its place). */
  readonly resolveNamed: (named: DirectoryNamed) => Promise<DirectoryRef>;
  /** Whether two references are the same business. */
  readonly sameBusiness: (a: DirectoryRef, b: DirectoryRef) => boolean;
}

function reply(request: Request, websiteOrigin: string, status: number, body: OwnerReplyResponse | OwnerAccessResponse | null): Response {
  const headers = {
    ...ownerCorsHeaders(request.headers.get("origin"), websiteOrigin),
    "Cache-Control": "no-store",
    ...(body === null ? {} : { "Content-Type": "application/json" }),
  };
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function error(code: DirectoryError["code"], message: string, field: DirectoryError["field"] = null): DirectoryError {
  return { status: "error", code, message, field };
}

const SIGNED_OUT = error("signed_out", "Sign in to your dashboard to answer reviews.");
const NOT_OWNER = error("unavailable", "Only the verified owner of this business can answer its reviews.");
const NOT_FOUND = error("unavailable", "This review or reply is no longer there. Refresh the page and try again.");

/** The caller's own origin must be the website's: the browser fills Origin in itself, so a page cannot forge it. */
function originAllowed(request: Request, websiteOrigin: string): boolean {
  return websiteOriginAllowed(request.headers.get("origin"), websiteOrigin);
}

/** The answer to the browser's check before a credentialed JSON request. */
function preflight(request: Request, websiteOrigin: string): Response {
  const allowed = originAllowed(request, websiteOrigin);
  return new Response(null, { status: allowed ? 204 : 403, headers: { ...ownerCorsHeaders(request.headers.get("origin"), websiteOrigin), "Cache-Control": "no-store" } });
}

function statusOf(outcome: OwnerReplyOutcome, method: string): { readonly status: number; readonly body: OwnerReplyResponse } {
  switch (outcome.kind) {
    case "saved":
      return { status: method === "POST" ? 201 : 200, body: { status: "saved", reply: outcome.reply } };
    case "removed":
      return { status: 200, body: { status: "removed" } };
    case "invalid":
      return { status: 422, body: error("invalid", outcome.message, "text") };
    case "not_found":
      return { status: 404, body: NOT_FOUND };
    case "limited":
      return { status: 429, body: error("limited", "You are replying very fast. Wait a little and try again.") };
    case "failed":
      return { status: 500, body: error("failed", "We couldn't save your reply. Please try again.") };
  }
}

/** The request's JSON body: throws BodyTooLargeError past the limit, and SyntaxError for anything that is not JSON. */
async function readJsonBody(request: Request): Promise<unknown> {
  const bytes = await readLimitedBody(request.body, MAX_BODY_BYTES);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

type Work = (owner: OwnerOf, now: Date) => Promise<OwnerReplyOutcome>;

/** What the method and body ask for, once the body fits the contract; null when it does not. */
function workFor(method: string, raw: unknown, deps: OwnerReplyDeps): Work | null {
  if (method === "POST") {
    const parsed = ownerReplyPostRequestSchema.safeParse(raw);
    return parsed.success ? (owner, now) => deps.post(owner, parsed.data, now) : null;
  }
  if (method === "PATCH") {
    const parsed = ownerReplyEditRequestSchema.safeParse(raw);
    return parsed.success ? (owner, now) => deps.change(owner, parsed.data, now) : null;
  }
  const parsed = ownerReplyRemoveRequestSchema.safeParse(raw);
  return parsed.success ? (owner, now) => deps.takeDown(owner, parsed.data, now) : null;
}

/** `POST`, `PATCH` and `DELETE /api/directory-owner/replies`. */
export async function handleOwnerReplyRequest(request: Request, deps: OwnerReplyDeps): Promise<Response> {
  const { websiteOrigin } = deps;
  if (request.method === "OPTIONS") return preflight(request, websiteOrigin);
  if (request.method !== "POST" && request.method !== "PATCH" && request.method !== "DELETE") {
    return reply(request, websiteOrigin, 405, error("invalid", "Method not allowed."));
  }
  if (!originAllowed(request, websiteOrigin)) return reply(request, websiteOrigin, 403, error("unavailable", "This request is not allowed from here."));
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(request, websiteOrigin, 415, error("invalid", "Send JSON."));
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(request);
  } catch (cause) {
    if (cause instanceof BodyTooLargeError) return reply(request, websiteOrigin, 413, error("invalid", "That request is too large."));
    return reply(request, websiteOrigin, 400, error("invalid", "That request was not understood."));
  }
  const work = workFor(request.method, raw, deps);
  if (work === null) return reply(request, websiteOrigin, 400, error("invalid", "That request was not understood."));

  const owner = await deps.getOwner();
  if (owner.kind === "signed_out") return reply(request, websiteOrigin, 401, SIGNED_OUT);
  if (owner.kind === "not_owner") return reply(request, websiteOrigin, 403, NOT_OWNER);

  const outcome = await work(owner, deps.now());
  const answer = statusOf(outcome, request.method);
  return reply(request, websiteOrigin, answer.status, answer.body);
}

const accessQuerySchema = z.object({ id: placeIdSchema.optional(), key: listingKeySchema.optional() });

/** `GET /api/directory-owner/access?id=…` or `?key=…`: is the signed-in caller the verified owner of this business? */
export async function handleOwnerAccessRequest(request: Request, deps: OwnerAccessDeps): Promise<Response> {
  const { websiteOrigin } = deps;
  if (request.method === "OPTIONS") return preflight(request, websiteOrigin);
  if (request.method !== "GET") return reply(request, websiteOrigin, 405, error("invalid", "Method not allowed."));
  if (!originAllowed(request, websiteOrigin)) return reply(request, websiteOrigin, 403, error("unavailable", "This request is not allowed from here."));

  const params = new URL(request.url).searchParams;
  const query = accessQuerySchema.safeParse({ id: params.get("id") ?? undefined, key: params.get("key") ?? undefined });
  if (!query.success || (query.data.id === undefined) === (query.data.key === undefined)) {
    return reply(request, websiteOrigin, 400, error("invalid", "Name the business by its id or its key."));
  }

  const owner = await deps.getOwner();
  // A visitor who is not signed in, or is not an owner, simply is not this business's owner: no error to show.
  if (owner.kind !== "owner") return reply(request, websiteOrigin, 200, { status: "ok", owner: false });
  const named: DirectoryNamed = query.data.id !== undefined ? { by: "id", id: query.data.id } : { by: "key", key: query.data.key ?? "" };
  const asked = await deps.resolveNamed(named);
  return reply(request, websiteOrigin, 200, { status: "ok", owner: deps.sameBusiness(asked, owner.business) });
}
