import { adminBrand } from "@/lib/brand";
import { findBusinessOwnerPhone, listTaxInvoicesIssuedBetween } from "@brandbasket/db";
import { monthRange, registerCsv, RegisterInvoiceError, registerInvoiceOf } from "@brandbasket/shared/lib/billing/invoice-register";
import { describeError, logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { staffCan } from "@brandbasket/shared/lib/access";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { renderTaxInvoicesPdf } from "@brandbasket/shared/server/tax-invoice-pdf";
import { createZip, type ZipEntry } from "@brandbasket/shared/server/zip";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Makes Excel read the register as UTF-8, so a customer name in any script opens right. */
const BYTE_ORDER_MARK = "\uFEFF";

// shortcut: one request renders at most 500 invoices, split by day beyond that
const MAX_INVOICES = 500;

const encoder = new TextEncoder();

function refuse(status: 400 | 401 | 403 | 404 | 413 | 500): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * `/invoices/export/zip?month=2026-10`: every tax invoice of the month as its own PDF, plus the month's register CSV,
 * in one ZIP for the CA. Access, refusals and logging follow the CSV export: a bare 401 for anyone without staff access,
 * a bare 403 (recorded) for a role without money access, and nothing sent unless the export is recorded in the staff
 * access log first. A month with no invoices is a bare 404, and a month over the render limit a bare 413. An invoice
 * the register cannot write fails the whole file with a generic 500, because a register with a row missing would be
 * filed as complete. The file holds customer names and GSTINs, so it is a private download and never cached.
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
  if (invoices.length === 0) return refuse(404);
  if (invoices.length > MAX_INVOICES) return refuse(413);

  let csv: string;
  try {
    csv = registerCsv(invoices.map(registerInvoiceOf));
  } catch (error) {
    if (!(error instanceof RegisterInvoiceError)) throw error;
    logBillingEvent("error", "invoice-register-failed", { month, invoiceNumber: error.invoiceNumber, ...describeError(error.cause) });
    return refuse(500);
  }

  const modifiedAt = new Date();
  const entries: ZipEntry[] = [];
  const ownerPhones = new Map<string, string | null>();
  for (const invoice of invoices) {
    let ownerPhone = ownerPhones.get(invoice.businessId);
    if (ownerPhone === undefined) {
      ownerPhone = await findBusinessOwnerPhone(getStaffDb(), invoice.businessId);
      ownerPhones.set(invoice.businessId, ownerPhone);
    }
    // Drawn one at a time, the same way the single-invoice download draws it.
    const pdf = await renderTaxInvoicesPdf([invoice], { recipientPhone: displayPhoneText(ownerPhone) });
    entries.push({ name: `invoices/${invoice.number.replaceAll("/", "-")}.pdf`, data: pdf, modifiedAt });
  }
  entries.push({ name: "register.csv", data: encoder.encode(`${BYTE_ORDER_MARK}${csv}`), modifiedAt });
  const zip = createZip(entries);

  try {
    await logStaffAccessOrThrow({
      staffUserId: access.user.id,
      action: "invoice.export_zip",
      targetType: "invoice_register",
      targetId: month,
      detail: `invoices=${invoices.length}`,
    });
  } catch (error) {
    console.error("An invoice ZIP was not sent because it could not be recorded.", errorLogInfo(error));
    return refuse(500);
  }
  return new Response(Buffer.from(zip), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${adminBrand().id}-invoices-${month}.zip"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
