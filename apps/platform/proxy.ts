import { NextResponse, type NextRequest } from "next/server";
import { BRAND, isDirectoryOnlyPath } from "@/lib/brand";
import {
  isPayloadAdminPath,
  readOriginsFromEnv,
  resolveSurface,
  rewritePathForSurface,
  type SurfaceOrigins,
} from "@/lib/surfaces";

export type ProxyHandler = (request: NextRequest) => NextResponse;

/** Everything this app serves is a dashboard or Payload's admin UI, so nothing here may be indexed. */
function rewriteTo(request: NextRequest, targetPath: string, search: string): NextResponse {
  const response = NextResponse.rewrite(new URL(`${targetPath}${search}`, request.url));
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * Builds the routing handler for a fixed set of origins. Kept pure and separate from `proxy` below
 * so tests can supply origins directly instead of going through `process.env`.
 */
export function createProxy(origins: SurfaceOrigins | null): ProxyHandler {
  return function handleProxyRequest(request: NextRequest): NextResponse {
    const surface = origins === null ? null : resolveSurface(request.headers.get("host"), origins);
    if (surface === null) return new NextResponse(null, { status: 404 });

    const { pathname, search } = request.nextUrl;

    // Payload's admin UI lives at its own top-level /admin, outside both SURFACE_PATH_PREFIX route groups (see
    // lib/surfaces.ts). Staff-only: 404 on every host but the admin one, and pass admin-host requests through
    // unprefixed so they reach the real /admin route instead of being rewritten into /admin-host/admin (which
    // does not exist).
    // Payload's own admin UI is mounted at /admin in this app but has no surface to be served on: the staff
    // console is apps/admin now, and nobody ever authenticates to Payload itself. Refuse it outright rather than
    // let it appear on the customer host, which is the assumption collections/Media.ts's access block rests on.
    if (isPayloadAdminPath(pathname)) return new NextResponse(null, { status: 404 });

    // The product does not sell the directory listing, so it has no use for the pages that exist only for it: they get the
    // dashboard's own not-found screen (app/app-host/[...missing]) however the address was reached.
    if (!BRAND.showsListing && isDirectoryOnlyPath(pathname)) {
      return rewriteTo(request, rewritePathForSurface(surface, "/not-here"), "");
    }

    return rewriteTo(request, rewritePathForSurface(surface, pathname), search);
  };
}

/**
 * Routes the dashboard's hostname to the customer app. Any other host, and every host when APP_ORIGIN is unset, gets a 404. This is routing, not authorization: every dashboard page and
 * server action checks access itself.
 */
export const proxy: ProxyHandler = createProxy(readOriginsFromEnv(process.env));

export const config = {
  // Skip Next.js internals, API routes, generated icons and static files by extension. Every other path,
  // including dotted dynamic segments such as /sites/acme.com, must pass through host routing.
  matcher: [
    "/((?!_next/|api/|icon(?:$|/|\\.)|apple-icon(?:$|/|\\.)|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|map|txt|xml|webmanifest|woff2?|ttf|otf)$).*)",
  ],
};
