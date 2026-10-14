import { handlePrivacyRequestConfirm } from "@/lib/server/privacy-request-intake";
import { confirmPrivacyRequestOtp } from "@/lib/server/privacy-requests";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `POST /api/privacy-requests/confirm` — the code the person was texted, which files their request and returns its
 * reference. Server-to-server only, with LEADS_API_TOKEN (see lib/server/privacy-request-intake.ts): no CORS.
 */
export function POST(request: Request): Promise<Response> {
  return handlePrivacyRequestConfirm(request, { token: leadsApiToken(), confirmOtp: confirmPrivacyRequestOtp, now: () => new Date() });
}
