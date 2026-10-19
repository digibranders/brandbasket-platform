import { loadGeoCatalog } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { handleGeoCatalog } from "@/lib/server/geo-catalog-api";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/catalog`: see lib/server/geo-catalog-api.ts. */
export function GET(request: Request): Promise<Response> {
  return handleGeoCatalog(request, { token: leadsApiToken(), readCatalog: () => loadGeoCatalog(getStaffDb()) });
}
