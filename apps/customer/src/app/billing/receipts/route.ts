import { receiptsDownload } from "@/features/checkout/server/receipts";
import { requireOwner } from "@/lib/guards";

/**
 * `GET /billing/receipts[?ids=<id>,<id>]`: the owner's invoices and receipts as one PDF. The old app's address, kept because
 * every payment email links to `/billing/receipts?ids=<paymentId>`. Someone signed out is sent to sign in; an editor is sent Home.
 */
export async function GET(request: Request): Promise<Response> {
  return receiptsDownload(request, await requireOwner());
}
