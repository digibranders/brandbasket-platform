import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ReportsList } from "@/components/panel/reports/reports-list";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadReportMonths } from "@/lib/server/reports";

export const metadata: Metadata = { title: "Reports" };

/** The monthly reports. A lapsed customer keeps reading what was sent; a listing account has no reports and is sent to its own page. */
export default async function ReportsPage(): Promise<ReactElement> {
  const customer = await requireCustomerAccess();
  return <ReportsList months={await loadReportMonths(customer)} />;
}
