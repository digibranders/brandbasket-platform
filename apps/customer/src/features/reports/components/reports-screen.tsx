import Link from "next/link";
import { PageHeader, Panel, PanelError } from "@/components";
import { formatDate } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { LinkButton } from "@/ui";
import { loadReportMonths } from "../loader";
import { highlightsOf, reportPath } from "../rules";
import { ReportsTable, type ReportRow } from "./reports-table";

/** The newest report, raised as the one focal card of the list. */
function LatestReport({ row }: { readonly row: ReportRow }) {
  return (
    <article className="flex flex-col gap-4 rounded-overlay border border-border border-t-2 border-t-accent-gold bg-surface p-6 shadow-hero sm:p-7">
      <p className="type-meta">
        Latest report, sent <span className="font-mono tabular-nums">{formatDate(row.sentAt)}</span>
      </p>
      <div>
        <h2 className="type-hero-task text-ink">
          <Link href={row.href} className="text-ink no-underline hover:underline">
            {row.title}
          </Link>
        </h2>
        {row.highlights === null ? null : <p className="mt-1.5 type-body text-ink-2">{row.highlights}</p>}
      </div>
      <div>
        <LinkButton href={row.href} variant="primary">
          Open report
        </LinkButton>
      </div>
    </article>
  );
}

/** The Reports list: the newest sent month as the focal card, older months below. A month without a sent report is not listed. */
export async function ReportsScreen({ customer }: { readonly customer: CustomerContext }) {
  const loaded = await load("reports.list", () => loadReportMonths(customer));
  const rows: readonly ReportRow[] = loaded.ok
    ? loaded.data.map((month) => ({ key: month.key, title: month.title, href: reportPath(month.key), highlights: highlightsOf(month), sentAt: month.sentAt }))
    : [];
  const [latest, ...past] = rows;
  return (
    <>
      <PageHeader title="Reports" description="One report a month: what we did and what it brought you." />
      {!loaded.ok ? (
        <Panel title="Reports">
          <PanelError failure={loaded.error} what="your reports" />
        </Panel>
      ) : latest === undefined ? (
        <Panel flush>
          <ReportsTable rows={rows} />
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          <LatestReport row={latest} />
          {past.length === 0 ? null : (
            <Panel title="Past reports" flush>
              <ReportsTable rows={past} />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
