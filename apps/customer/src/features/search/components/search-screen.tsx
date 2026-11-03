import { MetricStrip, PageHeader, Panel, PanelData, PanelEmpty, PanelError } from "@/components";
import { loadReportLink } from "@/features/social/loader";
import { SetupCard } from "@/features/setup/components/setup-card";
import { loadSetupAsks } from "@/features/setup/loader";
import { dueLabel } from "@/features/social/rules";
import { formatDate } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { Banner, Icon, LinkButton } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import { loadSearchNumbers, loadSearchWork } from "../loader";
import { AEO_EXPLAINED, ASK_FOR_CHANGE_HREF, SEARCH_DESCRIPTION } from "../rules";

/**
 * Local SEO + AEO Overview, from the monthly numbers and the finished work only (plan 61, section 4). Every number carries
 * the date it was checked. There is no combined score. Rankings, AI answers, reviews and the Google profile have no data
 * source yet, so they are neither drawn nor linked.
 */
export async function SearchScreen({ customer, now = new Date() }: { readonly customer: CustomerContext; readonly now?: Date }) {
  const [numbers, work, report, asks] = await Promise.all([
    load("search.numbers", () => loadSearchNumbers(customer, now)),
    load("search.work", () => loadSearchWork(customer, now)),
    load("search.report", () => loadReportLink(customer, "search")),
    load("search.setup", () => loadSetupAsks(customer, "search")),
  ]);
  const checked = numbers.ok && numbers.data.pageOne !== null ? numbers.data.pageOne.checkedAt : null;
  const reportHref = report.ok ? report.data : null;
  return (
    <>
      <PageHeader
        title="Local SEO + AEO"
        description={checked === null ? SEARCH_DESCRIPTION : `${SEARCH_DESCRIPTION} Last check ${formatDate(checked, now)}.`}
        actions={
          <>
            {reportHref === null ? null : (
              <a href={reportHref} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
                <Icon name="ArrowUpRight" size="sm" />
                Monthly report
              </a>
            )}
            {customer.role === "viewer" ? null : <LinkButton href={ASK_FOR_CHANGE_HREF}>Ask for a change</LinkButton>}
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Banner>{AEO_EXPLAINED}</Banner>
        {asks.ok ? <SetupCard asks={asks.data} /> : <Panel title="What we need from you"><PanelError failure={asks.error} what="what we need from you" /></Panel>}
        {!numbers.ok ? (
          <Panel title="Searches on Google's first page">
            <PanelError failure={numbers.error} what="your monthly numbers" />
          </Panel>
        ) : numbers.data.pageOne === null ? (
          <Panel title="Searches on Google's first page">
            <PanelEmpty icon="ChartLineUp" title="No count yet" description="We count these once a month and add the figure here." />
          </Panel>
        ) : (
          <MetricStrip
            label="Searches"
            metrics={[
              {
                label: "Searches on Google's first page",
                value: String(numbers.data.pageOne.count),
                ...(numbers.data.pageOne.diff === null ? {} : { change: { value: numbers.data.pageOne.diff } }),
                period: numbers.data.pageOne.change === null ? numbers.data.month : `${numbers.data.month}. ${numbers.data.pageOne.change}`,
                asOf: numbers.data.pageOne.checkedAt,
              },
            ]}
          />
        )}
        <PanelData
          data={work}
          title={work.ok ? `What we did in ${work.data.month}` : "What we did this month"}
          what="the work we finished"
          flush
          isEmpty={(data) => data.items.length === 0}
          empty={{ icon: "FileText", title: "Nothing is finished yet this month.", description: "Each page we improve and each listing we fix appears here once it is done." }}
        >
          {(data) => (
            <ul>
              {data.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                  <Icon name={item.kind === "page" ? "FileText" : "MapPin"} className="text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-body font-medium text-ink">
                      {item.href === null ? (
                        item.title
                      ) : (
                        <a href={item.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {item.title}
                        </a>
                      )}
                    </p>
                    <p className="type-meta">{item.kind === "page" ? "Page improved" : "Listing fixed"}</p>
                  </div>
                  <span className="type-meta">{dueLabel(item.dueOn, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelData>
      </div>
    </>
  );
}
