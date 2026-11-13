import "server-only";
import { listSentReports, withTenantScope } from "@brandbasket/db";
import type { ReportService } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { MonthKey } from "@brandbasket/shared/lib/reports/period";
import { reportPdfStorageKey } from "@brandbasket/shared/server/media-keys";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { groupSentByMonth, readContent, type ReportContent, type ReportMonth } from "@/lib/reports/rules";
import { getAppDb } from "./db";
import { reportServerError } from "./error-report";

/** The session's tenant. The business is always its own, never a parameter. */
type Reader = { readonly tenant: TenantContext };

/** Every sent report of the session's business, grouped by month, newest first. */
export async function loadReportMonths(customer: Reader): Promise<ReportMonth[]> {
  const documents = await withTenantScope(getAppDb(), customer.tenant, (tx) => listSentReports(tx, customer.tenant.businessId));
  return groupSentByMonth(documents);
}

export interface ServiceReportView {
  readonly service: ReportService;
  /** Null when the stored document is not one this screen can read. */
  readonly content: ReportContent | null;
  readonly hasPdf: boolean;
}

export interface ReportMonthView {
  readonly key: MonthKey;
  readonly title: string;
  readonly sentAt: Date;
  readonly services: readonly ServiceReportView[];
}

/** One month, or null when the business has no sent report for it. A document that cannot be read goes to the error log and shows as unreadable. */
export async function loadReportMonth(customer: Reader, key: MonthKey): Promise<ReportMonthView | null> {
  const month = (await loadReportMonths(customer)).find((candidate) => candidate.key === key);
  if (month === undefined) return null;
  const services: ServiceReportView[] = [];
  for (const report of month.reports) {
    const content = readContent(report);
    if (content === null) {
      await reportServerError(new Error(`Report document ${report.id} (${report.service}, version ${report.contentVersion}) is not readable`), {
        app: "platform",
        operation: "server_render",
        route: "/reports/[month]",
        userId: customer.tenant.userId,
      });
    }
    services.push({ service: report.service, content, hasPdf: report.pdfKey !== null });
  }
  return { key: month.key, title: month.title, sentAt: month.sentAt, services };
}

/** The stored PDF of one service's report: null when there is none to give. */
export async function loadReportPdf(customer: Reader, key: MonthKey, service: ReportService): Promise<Uint8Array | null> {
  const month = (await loadReportMonths(customer)).find((candidate) => candidate.key === key);
  const report = month?.reports.find((candidate) => candidate.service === service);
  if (report === undefined || report.pdfKey === null) return null;
  const stored = await getMediaStorage().get(reportPdfStorageKey(report.id));
  // The report was sent with a PDF, so a missing file is our fault, not a 404 for the customer: fail so it is reported.
  if (stored === null) throw new Error(`Report ${report.id} says it has a PDF but the file is not in storage`);
  return stored.bytes;
}
