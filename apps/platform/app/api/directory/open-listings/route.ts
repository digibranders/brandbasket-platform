import { openListingsVersion, listVisibleOpenListings } from "@fynix/db";
import { getStaffDb } from "@/lib/server/db";
import { handleOpenListingsPage } from "@/lib/server/open-listings-api";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/open-listings?after=<place id>&limit=<n>`: see lib/server/open-listings-api.ts. */
export function GET(request: Request): Promise<Response> {
  return handleOpenListingsPage(request, {
    token: leadsApiToken(),
    readVersion: () => openListingsVersion(getStaffDb()),
    readPage: (page) => listVisibleOpenListings(getStaffDb(), page),
  });
}
