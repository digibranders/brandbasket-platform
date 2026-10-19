import "server-only";
import { consumeRateLimit } from "@brandbasket/db";
import { accountExportFilename, buildAccountExport } from "@/lib/server/account-export";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { getAppDb, getStaffDb } from "@/lib/server/db";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
/** A copy of your data is a handful of reads; a few an hour is plenty for a person and stops a loop. */
const EXPORT_RULE = { limit: 6, windowSeconds: 60 * 60 } as const;

/**
 * `GET /settings/privacy/export` — the signed-in owner's own data as a JSON download. The account and business come from
 * the session, never from the address, so there is nothing in the request to change whose data is returned.
 */
export async function GET(): Promise<Response> {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const now = new Date();
  const limit = await consumeRateLimit(getStaffDb(), `account-export:user:${access.user.id}`, EXPORT_RULE, now);
  if (!limit.allowed) return new Response("Too many downloads. Please try again later.", { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } });

  const file = await buildAccountExport({ app: getAppDb(), staff: getStaffDb() }, { userId: access.user.id, businessId: access.tenant.businessId, now });
  const day = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${accountExportFilename(day)}"`,
    },
  });
}
