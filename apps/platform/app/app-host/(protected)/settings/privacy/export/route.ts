import "server-only";
import { consumeRateLimit, listMembershipsForUser } from "@brandbasket/db";
import { accountExportFilename, buildAccountExport } from "@/lib/server/account-export";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/session";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
/** A copy of your data is a handful of reads; a few an hour is plenty for a person and stops a loop. */
const EXPORT_RULE = { limit: 6, windowSeconds: 60 * 60 } as const;

/**
 * `GET /settings/privacy/export`: the signed-in person's own data as a JSON download. The user comes from the session and the
 * business from that user's own membership, never from the address, so nothing in the request changes whose data is returned.
 * It also answers an account that has asked to be deleted: the right to a copy of your data (DPDP Act) does not end with the
 * account. Someone signed out still gets a bare 401. Only an owner's file carries the business's records.
 */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (user === null) return new Response(null, { status: 401, headers: NO_STORE });
  const now = new Date();
  const limit = await consumeRateLimit(getStaffDb(), `account-export:user:${user.id}`, EXPORT_RULE, now);
  if (!limit.allowed) return new Response("Too many downloads. Please try again later.", { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } });

  const membership = (await listMembershipsForUser(getAppDb(), user.id))[0];
  const businessId = membership?.role === "owner" ? membership.businessId : null;
  const file = await buildAccountExport({ app: getAppDb(), staff: getStaffDb() }, { userId: user.id, businessId, now });
  const day = now.toISOString().slice(0, 10);
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${accountExportFilename(day)}"`,
    },
  });
}
