import { getAuth } from "@/lib/auth";
import { isOpenAuthRoute } from "@/lib/auth-routes";

/** Better Auth's HTTP handler, limited to the routes in src/lib/auth-routes.ts. Every other address is a 404. */
async function handle(request: Request): Promise<Response> {
  if (!isOpenAuthRoute(request.method, new URL(request.url).pathname)) return new Response(null, { status: 404 });
  return getAuth().handler(request);
}

export const GET = handle;
export const POST = handle;
