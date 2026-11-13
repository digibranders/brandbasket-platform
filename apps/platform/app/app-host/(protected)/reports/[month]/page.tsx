import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { ReportMonth } from "@/components/panel/reports/report-month";
import { parseMonthParam } from "@/lib/reports/rules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadReportMonth } from "@/lib/server/reports";

export const metadata: Metadata = { title: "Report" };

/** One month's sent reports. A month that is not a month, or one the session's business has no sent report for, is a 404. */
export default async function ReportPage({ params }: { readonly params: Promise<{ readonly month: string }> }): Promise<ReactElement> {
  const customer = await requireCustomerAccess();
  const key = parseMonthParam((await params).month);
  if (key === null) notFound();
  const view = await loadReportMonth(customer, key);
  if (view === null) notFound();
  return <ReportMonth view={view} />;
}
