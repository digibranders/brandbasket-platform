import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Propagates the requested URL pathname into request headers as "x-pathname"
 * so server component layouts can inspect the route.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
