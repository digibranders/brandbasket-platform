import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { adminBrand } from "@/lib/brand";
import { readEnquiryQuery } from "@/lib/enquiries";
import { leadsCsv } from "@/lib/leads-csv";
import { loadEnquiryScreen } from "@/lib/server/enquiries-screen";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
/** Makes Excel read the file as UTF-8. */
const BYTE_ORDER_MARK = "\uFEFF";

/**
 * `/leads/export`: the enquiries the list is showing (same view, source, owner and search), as CSV. It holds names and
 * contact details, so it is private, never cached, and logged before it is sent; nothing is sent when the log fails.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: NO_STORE });
  const query = readEnquiryQuery(Object.fromEntries(new URL(request.url).searchParams));
  const screen = await loadEnquiryScreen(query, access.user.id);
  try {
    await logStaffAccessOrThrow({ staffUserId: access.user.id, action: "lead.export", targetType: "leads", detail: `rows=${screen.rows.length}` });
  } catch (error) {
    console.error("An enquiries export was not sent because it could not be recorded.", errorLogInfo(error));
    return new Response(null, { status: 500, headers: NO_STORE });
  }
  const csv = leadsCsv(screen.rows, (staffUserId) => screen.ownerNames.get(staffUserId) ?? staffUserId);
  return new Response(`${BYTE_ORDER_MARK}${csv}`, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${adminBrand().id}-enquiries-${screen.now.toISOString().slice(0, 10)}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
