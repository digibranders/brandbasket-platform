import "server-only";
import { listSentReports, withTenantScope } from "@brandbasket/db";
import type { ReportService } from "@brandbasket/db";
import type { MonthKey } from "@brandbasket/shared/lib/reports/period";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { groupSentByMonth, readContent, type ReportContent, type ReportMonth } from "./rules";

type Reader = Pick<CustomerContext, "tenant" | "businessId">;

/** Every sent report of the session's business, grouped by month, newest first. The business is the session's, never a parameter. */
export async function loadReportMonths(customer: Reader): Promise<ReportMonth[]> {
  const documents = await withTenantScope(getAppDb(), customer.tenant, (tx) => listSentReports(tx, customer.businessId));
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

/** One month, or null when the business has no sent report for it. A document that cannot be read goes to Sentry and shows as unreadable. */
export async function loadReportMonth(customer: Reader, key: MonthKey): Promise<ReportMonthView | null> {
  const month = (await loadReportMonths(customer)).find((candidate) => candidate.key === key);
  if (month === undefined) return null;
  const services = month.reports.map((report): ServiceReportView => {
    const content = readContent(report);
    if (content === null) reportError(new Error(`Report document ${report.id} (${report.service}, version ${report.contentVersion}) is not readable`), { area: "reports.content" });
    return { service: report.service, content, hasPdf: report.pdfKey !== null };
  });
  return { key: month.key, title: month.title, sentAt: month.sentAt, services };
}

/** The stored PDF of one service's report: null when there is none to give. */
export async function loadReportPdf(customer: Reader, key: MonthKey, service: ReportService): Promise<Uint8Array | null> {
  const month = (await loadReportMonths(customer)).find((candidate) => candidate.key === key);
  const report = month?.reports.find((candidate) => candidate.service === service);
  if (report === undefined || report.pdfKey === null) return null;
  // No report PDF is ever written (no generator) and no storage reader accepts a `reports/<id>.pdf` key. Fail loudly if one appears.
  throw new Error(`Report ${report.id} has a stored PDF but no reader for report PDFs exists`);
}
