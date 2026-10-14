import { handlePrivacyRequestOtp } from "@/lib/server/privacy-request-intake";
import { requestPrivacyRequestOtp } from "@/lib/server/privacy-requests";
import { leadsApiToken } from "@/lib/server/website-api-auth";
import { websiteOrigin } from "@/lib/server/website-origin";

/**
 * `POST /api/privacy-requests/otp` — a rights request or grievance from the website's public form, held until the code texted
 * to the number on it is confirmed. Server-to-server only, with LEADS_API_TOKEN (see lib/server/privacy-request-intake.ts):
 * no CORS, since a browser is never the caller.
 */
export function POST(request: Request): Promise<Response> {
  return handlePrivacyRequestOtp(request, { token: leadsApiToken(), websiteOrigin: websiteOrigin(), requestOtp: requestPrivacyRequestOtp, now: () => new Date() });
}
