import { handleLeadRequest } from "@/lib/server/lead-intake";
import { recordLead } from "@/lib/server/leads";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * Enquiries from the marketing website's Get started form: `POST /api/leads`. Only the website's server can call it,
 * with LEADS_API_TOKEN. It lives under /api/, which proxy.ts skips, so it answers on either dashboard host.
 */
export async function POST(request: Request): Promise<Response> {
  return handleLeadRequest(request, { token: leadsApiToken(), record: recordLead });
}
