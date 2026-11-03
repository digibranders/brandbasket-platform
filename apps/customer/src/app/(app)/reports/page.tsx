import type { Metadata } from "next";
import { ReportsScreen } from "@/features/reports/components/reports-screen";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const customer = await requirePaid();
  return <ReportsScreen customer={customer} />;
}
