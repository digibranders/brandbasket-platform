import { recordDirectoryEnquiry } from "@/lib/server/directory-enquiries";
import { resolveVisitor } from "@/lib/server/directory-visitor";
import { handleEnquiryRequest } from "@/lib/server/directory-intake";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/directory/enquiries` — "Send enquiry" on a directory card or business page (the business named by `id` or
 * `key`), or the list page's "Get the list of top …" form, stored for Fynix staff. Server-to-server only, with
 * LEADS_API_TOKEN (see lib/server/directory-intake.ts): no CORS.
 */
export function POST(request: Request): Promise<Response> {
  return handleEnquiryRequest(request, { token: leadsApiToken(), recordEnquiry: recordDirectoryEnquiry, resolveVisitor, now: () => new Date() });
}
