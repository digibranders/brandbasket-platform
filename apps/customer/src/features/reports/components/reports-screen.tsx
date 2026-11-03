import { PageHeader, Panel, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { loadReportMonths } from "../loader";
import { highlightsOf, reportPath } from "../rules";
import { ReportsTable, type ReportRow } from "./reports-table";

/** The Reports list: one row for every month that has a sent report. A month without one is not listed. */
export async function ReportsScreen({ customer }: { readonly customer: CustomerContext }) {
  const loaded = await load("reports.list", () => loadReportMonths(customer));
  const rows: readonly ReportRow[] = loaded.ok
    ? loaded.data.map((month) => ({ key: month.key, title: month.title, href: reportPath(month.key), highlights: highlightsOf(month), sentAt: month.sentAt }))
    : [];
  return (
    <>
      <PageHeader title="Reports" description="One report a month: what we did and what it brought you." />
      {loaded.ok ? (
        <Panel flush>
          <ReportsTable rows={rows} />
        </Panel>
      ) : (
        <Panel title="Reports">
          <PanelError failure={loaded.error} what="your reports" />
        </Panel>
      )}
    </>
  );
}
