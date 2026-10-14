import { adminBrand } from "@/lib/brand";
import { findBusinessOwnerPhone, findTaxInvoiceById } from "@fynix/db";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { staffCan } from "@fynix/shared/lib/access";
import { displayPhoneText } from "@fynix/shared/server/phone-display";
import { renderTaxInvoicesPdf } from "@fynix/shared/server/tax-invoice-pdf";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const idSchema = z.uuid();

function refuse(status: 400 | 401 | 403 | 404 | 500): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * A tax invoice as staff download it from a client's page: `/invoices/{invoiceId}` on the admin host. A file download
 * cannot follow a sign-in redirect usefully, so anyone without staff access gets a bare 401, and staff whose role does not
 * cover money a bare 403. The invoice is drawn on
 * request from its stored snapshot (D10) and sent as a private download, never cached. The download is recorded in the
 * staff access log before it is sent, and when that record cannot be written nothing is sent.
 */
export async function GET(_request: Request, context: RouteContext<"/invoices/[invoiceId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return refuse(401);
  if (!staffCan(access.staff.role, "money")) {
    await logStaffAccess({ staffUserId: access.user.id, action: "access.denied", targetType: "money", result: "denied" });
    return refuse(403);
  }
  const { invoiceId } = await context.params;
  const id = idSchema.safeParse(invoiceId);
  if (!id.success) return refuse(400);
  const invoice = await findTaxInvoiceById(getStaffDb(), id.data);
  if (invoice === null) return refuse(404);
  try {
    await logStaffAccessOrThrow({
      staffUserId: access.user.id,
      action: "invoice.view",
      targetType: "invoice",
      targetId: invoice.id,
      businessId: invoice.businessId,
    });
  } catch (error) {
    console.error("An invoice download was not sent because it could not be recorded.", errorLogInfo(error));
    return refuse(500);
  }
  // The owner's mobile goes under "Billed to" when the customer gave no billing details; it is never stored on the invoice.
  const ownerPhone = await findBusinessOwnerPhone(getStaffDb(), invoice.businessId);
  const bytes = await renderTaxInvoicesPdf([invoice], { recipientPhone: displayPhoneText(ownerPhone) });
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${adminBrand().id}-invoice-${invoice.number.replaceAll("/", "-")}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
