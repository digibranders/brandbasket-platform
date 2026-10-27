import { staffCan } from "@brandbasket/shared/lib/access";
import { normaliseSearchTerm } from "@/lib/console-search";
import { runConsoleSearch } from "@/lib/server/console-search";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * The console's search: `POST /search` with `{ "q": "..." }` answers `{ "hits": [...] }`. A POST, so what staff type (often
 * a phone number or an email address) never sits in a URL or a server log. Anyone without staff access gets a bare 401.
 * Invoice numbers are searched only for roles that can see money. Each search is recorded in the access log.
 */
export async function POST(request: Request): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const body: unknown = await request.json().catch(() => null);
  const term = normaliseSearchTerm(typeof body === "object" && body !== null && "q" in body ? body.q : null);
  if (term === null) return Response.json({ hits: [] }, { headers: NO_STORE });
  await logStaffAccess({ staffUserId: access.user.id, action: "search.run" });
  const hits = await runConsoleSearch(term, staffCan(access.staff.role, "money"));
  return Response.json({ hits }, { headers: NO_STORE });
}
