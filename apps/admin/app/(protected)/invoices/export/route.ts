import { adminBrand } from "@/lib/brand";
import { listTaxInvoicesIssuedBetween } from "@fynix/db";
import { monthRange, registerCsv, RegisterInvoiceError, registerInvoiceOf } from "@fynix/shared/lib/billing/invoice-register";
import { describeError, logBillingEvent } from "@fynix/shared/server/billing-log";
import { staffCan } from "@fynix/shared/lib/access";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Makes Excel read the file as UTF-8, so a customer name in any script opens right. */
const BYTE_ORDER_MARK = "\uFEFF";

function refuse(status: 400 | 401 | 403 | 500): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * `/invoices/export?month=2026-10`: the month's invoice register as CSV, for the CA's GST returns. A file download
 * cannot follow a sign-in redirect usefully, so anyone without staff access gets a bare 401, before the month is even
 * looked at, and staff whose role does not cover money get a bare 403 (and the refusal is recorded). The CSV holds customer names and GSTINs, so it is a private download and never cached. An invoice the
 * register cannot write (an unknown state) fails the whole file with a generic 500, because a register with a row
 * missing would be filed as complete; the log names the invoice number so staff can find and fix it. The export is
 * recorded in the staff access log before it is sent, and when that record cannot be written nothing is sent.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return refuse(401);
  if (!staffCan(access.staff.role, "money")) {
    await logStaffAccess({ staffUserId: access.user.id, action: "access.denied", targetType: "money", result: "denied" });
    return refuse(403);
  }
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const range = monthRange(month);
  if (range === null) return refuse(400);
  const invoices = await listTaxInvoicesIssuedBetween(getStaffDb(), range.from, range.to);
  let csv: string;
  try {
    csv = registerCsv(invoices.map(registerInvoiceOf));
  } catch (error) {
    if (!(error instanceof RegisterInvoiceError)) throw error;
    logBillingEvent("error", "invoice-register-failed", { month, invoiceNumber: error.invoiceNumber, ...describeError(error.cause) });
    return refuse(500);
  }
  try {
    await logStaffAccessOrThrow({
      staffUserId: access.user.id,
      action: "invoice.export",
      targetType: "invoice_register",
      targetId: month,
      detail: `rows=${invoices.length}`,
    });
  } catch (error) {
    console.error("An invoice export was not sent because it could not be recorded.", errorLogInfo(error));
    return refuse(500);
  }
  return new Response(`${BYTE_ORDER_MARK}${csv}`, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${adminBrand().id}-invoices-${month}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
