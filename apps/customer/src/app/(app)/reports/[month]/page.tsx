import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportScreen } from "@/features/reports/components/report-screen";
import { parseMonthParam } from "@/features/reports/rules";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params }: { readonly params: Promise<{ readonly month: string }> }) {
  const customer = await requirePaid();
  const month = parseMonthParam((await params).month);
  if (month === null) notFound();
  return <ReportScreen customer={customer} month={month} />;
}
