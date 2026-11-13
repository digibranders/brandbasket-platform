import "server-only";
import { consumeRateLimit, type RateLimitRule } from "@brandbasket/db";
import { enquiriesCsv, EXPORT_PATH, exportFileName } from "@/lib/enquiries/rules";
import { getCustomerBilling, getCustomerBusinessEntry } from "@/lib/server/customer-access";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { loadEnquiriesForExport } from "@/lib/server/enquiries";
import { reportServerError } from "@/lib/server/error-report";

export const dynamic = "force-dynamic";

/** An export reads every enquiry the business has; ten an hour is plenty for a person and stops a loop. */
const EXPORTS_PER_BUSINESS: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * `GET /website/enquiries/export`: the business's enquiries as a CSV download. It answers a bare status instead of redirecting,
 * as a download link cannot follow one, and applies the page's own rule: a website client, paid or lapsed (a lapsed customer
 * keeps reading). The business is the session's, never the address. Ten exports an hour per business, then a 429 with Retry-After.
 */
export async function GET(): Promise<Response> {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const { userId, businessId } = access.tenant;
  const [entry, billing] = await Promise.all([getCustomerBusinessEntry(userId, businessId), getCustomerBilling(userId, businessId)]);
  if (entry.kind === "listing" || (billing.hasAccess && !billing.hasWebsite)) return new Response(null, { status: 403, headers: NO_STORE });
  const budget = await consumeRateLimit(getAppDb(), `enquiries-export:business:${businessId}`, EXPORTS_PER_BUSINESS);
  if (!budget.allowed) {
    return new Response("That is a lot of exports. Try again in a while.", {
      status: 429,
      headers: { ...NO_STORE, "Retry-After": String(budget.retryAfterSeconds) },
    });
  }
  try {
    const records = await loadEnquiriesForExport({ tenant: access.tenant });
    return new Response(enquiriesCsv(records), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(new Date())}"`,
      },
    });
  } catch (error) {
    await reportServerError(error, { app: "platform", operation: "server_route", route: EXPORT_PATH });
    return new Response("We could not export your enquiries. Try again in a minute.", { status: 500, headers: NO_STORE });
  }
}
