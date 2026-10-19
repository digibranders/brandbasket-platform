import { openListingsVersion } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { handleOpenListingsVersion } from "@/lib/server/open-listings-api";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/open-listings/version`: see lib/server/open-listings-api.ts. */
export function GET(request: Request): Promise<Response> {
  return handleOpenListingsVersion(request, {
    token: leadsApiToken(),
    readVersion: () => openListingsVersion(getStaffDb()),
  });
}
