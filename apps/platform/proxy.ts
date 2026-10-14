import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie, hintCookieDomain, hintCookieOptions, hintUpdate, SIGNED_IN_HINT_COOKIE } from "@/lib/signed-in-hint";
import {
  brandForHost,
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

/** Where the website's signed-in marker is set (lib/signed-in-hint.ts): the shared parent domain, or the host itself. */
export interface SignedInHintConfig {
  readonly domain?: string;
}

/**
 * Keeps the website's signed-in marker in step with the dashboard login on every page it serves (lib/signed-in-hint.ts).
 * Page loads only: a form post is where sign-in and sign-out set the marker themselves, on this same response.
 */
function syncSignedInHint(request: NextRequest, response: NextResponse, appOrigin: string, hint: SignedInHintConfig): void {
  if (request.method !== "GET") return;
  const update = hintUpdate({
    hasSession: hasSessionCookie((name) => request.cookies.has(name)),
    hint: request.cookies.get(SIGNED_IN_HINT_COOKIE)?.value ?? null,
  });
  if (update.kind === "none") return;
  const options = hintCookieOptions({ appOrigin, domain: hint.domain });
  response.cookies.set(SIGNED_IN_HINT_COOKIE, update.kind === "set" ? update.value : "", update.kind === "set" ? options : { ...options, maxAge: 0 });
}

/**
 * Builds the routing handler for a fixed set of origins. Kept pure and separate from `proxy` below
 * so tests can supply origins directly instead of going through `process.env`.
 */
export function createProxy(origins: SurfaceOrigins | null, hint: SignedInHintConfig = {}): ProxyHandler {
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

    const response = rewriteTo(request, rewritePathForSurface(surface, pathname), search);
    // The website's signed-in marker is Firstfold's (a cookie on its parent domain, read by firstfold.io): the Fynix host
    // has no website reading it, and a browser would refuse the parent domain on it anyway.
    if (origins !== null && brandForHost(request.headers.get("host"), origins) === "firstfold") {
      syncSignedInHint(request, response, origins.app, hint);
    }
    return response;
  };
}

/**
 * Routes each hostname to its dashboard: the customer app or the staff admin. Any other host, and every host when
 * APP_ORIGIN and ADMIN_ORIGIN are unset, gets a 404. This is routing, not authorization: every dashboard page and
 * server action checks access itself.
 */
const envOrigins = readOriginsFromEnv(process.env);
export const proxy: ProxyHandler = createProxy(envOrigins, {
  domain: envOrigins === null ? undefined : hintCookieDomain(process.env.SIGNED_IN_HINT_DOMAIN, envOrigins.app),
});

export const config = {
  // Skip Next.js internals, API routes, generated icons and static files by extension. Every other path,
  // including dotted dynamic segments such as /sites/acme.com, must pass through host routing.
  matcher: [
    "/((?!_next/|api/|icon(?:$|/|\\.)|apple-icon(?:$|/|\\.)|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|map|txt|xml|webmanifest|woff2?|ttf|otf)$).*)",
  ],
};
