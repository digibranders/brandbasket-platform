import { resolveDirectoryNamedForRead, sameDirectoryBusiness } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { getOwnedDirectoryBusiness } from "@/lib/server/owner-business";
import { handleOwnerAccessRequest } from "@/lib/server/owner-reply-request";
import { websiteOrigin } from "@/lib/server/website-origin";

/**
 * `GET /api/directory-owner/access?id=…` (or `?key=…`) — whether the signed-in caller is this business's verified owner,
 * so the website's page shows its Reply controls to them alone. Only a hint for the page: every write is checked again.
 */
function handle(request: Request): Promise<Response> {
  return handleOwnerAccessRequest(request, {
    websiteOrigin: websiteOrigin(),
    getOwner: getOwnedDirectoryBusiness,
    resolveNamed: (named) => resolveDirectoryNamedForRead(getStaffDb(), named),
    sameBusiness: sameDirectoryBusiness,
  });
}

export const GET = handle;
export const OPTIONS = handle;
