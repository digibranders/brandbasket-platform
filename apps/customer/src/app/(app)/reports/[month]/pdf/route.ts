import { loadReportPdf } from "@/features/reports/loader";
import { isReportService, parseMonthParam } from "@/features/reports/rules";
import { requirePaid } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * One service's report as a PDF. Same guard as the page (a lapsed customer keeps reading); the business is the session's, so a
 * month or service the session's business has no sent report for, another business's included, is a 404.
 */
export async function GET(request: Request, context: { readonly params: Promise<{ readonly month: string }> }): Promise<Response> {
  const customer = await requirePaid();
  const month = parseMonthParam((await context.params).month);
  const service = new URL(request.url).searchParams.get("service");
  if (month === null || !isReportService(service)) return new Response("Not found", { status: 404, headers: NO_STORE });
  const loaded = await load("reports.pdf", () => loadReportPdf(customer, month, service));
  if (!loaded.ok) return new Response("We could not get this report. Try again in a minute.", { status: 500, headers: NO_STORE });
  if (loaded.data === null) return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(loaded.data.slice().buffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="report-${month}-${service}.pdf"`, ...NO_STORE },
  });
}
