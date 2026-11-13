import "server-only";
import { isReportService, parseMonthParam } from "@/lib/reports/rules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { reportServerError } from "@/lib/server/error-report";
import { loadReportPdf } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * One service's report as a PDF, the address the monthly email links to. Same guard as the page (a signed-out reader is
 * sent to sign in and comes back); the business is the session's, so a month or service the session's business has no sent
 * report for, another business's included, is a 404.
 */
export async function GET(request: Request, context: { readonly params: Promise<{ readonly month: string }> }): Promise<Response> {
  const customer = await requireCustomerAccess();
  const month = parseMonthParam((await context.params).month);
  const service = new URL(request.url).searchParams.get("service");
  if (month === null || !isReportService(service)) return new Response("Not found", { status: 404, headers: NO_STORE });
  let bytes: Uint8Array | null;
  try {
    bytes = await loadReportPdf(customer, month, service);
  } catch (error) {
    await reportServerError(error, { app: "platform", operation: "server_route", route: "/reports/[month]/pdf", userId: customer.tenant.userId });
    return new Response("We could not get this report. Try again in a minute.", { status: 500, headers: NO_STORE });
  }
  if (bytes === null) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(bytes.slice().buffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="report-${month}-${service}.pdf"`, ...NO_STORE },
  });
}
