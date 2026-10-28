import { NextResponse } from "next/server";
import { isSiteOffline } from "@/lib/offline-check";
import { maintenanceResponse } from "@/lib/maintenance-response";

/**
 * Runs before every page, route and file: while the client's plan has ended, nothing is served but the maintenance page,
 * as a 503 (docs/site-hosting.md). `app/layout.tsx` checks the same thing for pages, so a site keeps working if this file is
 * left out, but only this covers the site's own API routes and form posts. (Next 15 and older: name this file middleware.ts
 * and the function `middleware`.)
 */
export async function proxy(): Promise<Response> {
  if (!(await isSiteOffline())) return NextResponse.next();
  const name = process.env.SITE_BUSINESS_NAME?.trim();
  return maintenanceResponse(name === "" ? undefined : name);
}

// Everything but Next's own build files, which carry no content and which the maintenance page does not use.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
