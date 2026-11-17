import { NextResponse, type NextRequest } from "next/server";
import { verifyCloudflareAccess } from "@/lib/server/cloudflare-access";

/**
 * Console proxy: runs before every page, route and action in the staff console.
 *
 * When REQUIRE_CF_ACCESS=1, verifies the Cf-Access-Jwt-Assertion header against Cloudflare Access.
 * Requests without a valid signature, issuer or audience are refused with 401.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const result = await verifyCloudflareAccess(request);
  if (!result.ok) {
    return new Response("Cloudflare Access assertion missing or invalid.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

// Everything except Next.js static files, favicon and the push files. A browser fetches the service worker, the manifest and
// the icons without the Cloudflare Access cookie (a worker script is requested outside the page's credentials), so the proxy
// would answer 401 and push could never register. They hold nothing private. Cloudflare Access must bypass the same paths.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)"],
};
