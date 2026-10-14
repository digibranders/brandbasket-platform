import "server-only";
import { serverEnv } from "@/lib/server/env";
import { normaliseHost } from "@/lib/surfaces";

/**
 * Payload's REST and GraphQL routes live under /api/, which proxy.ts's matcher deliberately skips (see its own
 * comment, and lib/server/upload-request.ts, which checks its own Host for the same reason: /api/leads and
 * /api/uploads must stay reachable without host-based rewriting). So unlike /admin — which proxy.ts does gate,
 * since it is not skipped by that matcher — Payload's /api/* route handlers check the Host header themselves,
 * the same way upload-request.ts already does, rather than through proxy.ts.
 */
export function isAdminHostRequest(request: Request): boolean {
  const rawHost = request.headers.get("host");
  const adminHost = normaliseHost(new URL(serverEnv().ADMIN_ORIGIN).host);
  return rawHost !== null && adminHost !== null && normaliseHost(rawHost) === adminHost;
}

/**
 * Wraps a Payload route handler (its REST catch-all, GraphQL, and GraphQL playground routes all use this — see
 * app/(payload)/api/**\/route.ts) so it 404s on any host but the admin one, instead of running at all. A bare,
 * empty 404 rather than a JSON error: this is staff-only infrastructure, so the response should not confirm to a
 * customer or marketing-site request that Payload exists at all.
 */
export function requireAdminHost<Args extends readonly unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return (request, ...args) =>
    isAdminHostRequest(request) ? handler(request, ...args) : Promise.resolve(new Response(null, { status: 404 }));
}
