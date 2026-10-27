import { listPaymentsForStaff } from "@brandbasket/db";
import { staffCan } from "@brandbasket/shared/lib/access";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { adminBrand } from "@/lib/brand";
import { paymentsCsv } from "@/lib/payments-csv";
import { paymentMonthBounds } from "@/lib/payments-view";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Makes Excel read the file as UTF-8, so a client name in any script opens right. */
const BYTE_ORDER_MARK = "\uFEFF";

/** shortcut: a whole month in one file; split the export if a month ever passes 5,000 payments. */
const EXPORT_LIMIT = 5000;

function refuse(status: 400 | 401 | 403 | 500): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * `/payments/export?month=2026-11`: the month's payments as CSV for the CA. Like the invoice export: a bare 401 for
 * anyone who is not staff, a recorded 403 for staff without money access, and nothing sent unless the export was
 * written to the access log first. Holds client names, so it is private and never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return refuse(401);
  if (!staffCan(access.staff.role, "money")) {
    await logStaffAccess({ staffUserId: access.user.id, action: "access.denied", targetType: "money", result: "denied" });
    return refuse(403);
  }
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const bounds = paymentMonthBounds(month);
  if (bounds === null) return refuse(400);
  const rows = await listPaymentsForStaff(getStaffDb(), { ...bounds, limit: EXPORT_LIMIT });
  try {
    await logStaffAccessOrThrow({ staffUserId: access.user.id, action: "payment.export", targetType: "payments", targetId: month, detail: `rows=${rows.length}` });
  } catch (error) {
    console.error("A payments export was not sent because it could not be recorded.", errorLogInfo(error));
    return refuse(500);
  }
  return new Response(`${BYTE_ORDER_MARK}${paymentsCsv(rows)}`, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${adminBrand().id}-payments-${month}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
