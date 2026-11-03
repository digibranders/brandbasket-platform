import { notFound } from "next/navigation";
import type { MonthKey } from "@brandbasket/shared/lib/reports/period";
import { PageHeader, Panel, PanelError } from "@/components";
import { formatDate } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { Banner, LinkButton, ServiceTag } from "@/ui";
import { loadReportMonth, type ReportMonthView } from "../loader";
import { monthTitle, pdfPath, REPORTS_PATH } from "../rules";

const BACK = { href: REPORTS_PATH, label: "Reports" } as const;

function Report({ view }: { readonly view: ReportMonthView }) {
  const readable = view.services.flatMap((service) => (service.content === null ? [] : [{ service, content: service.content }]));
  const done = readable.flatMap(({ content }) => content.whatWeDid);
  return (
    <div className="flex flex-col gap-4">
      {readable.length === 0 ? null : (
        <Panel title="The month in short">
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5 type-body">
            {readable.map(({ service, content }) => (
              <li key={service.service}>{content.headline}</li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {view.services.map((service) =>
          service.content === null ? (
            <Panel key={service.service} title={<ServiceTag service={service.service} />}>
              <Banner tone="neg">We could not show this part of the report. Tell us and we will fix it.</Banner>
            </Panel>
          ) : (
            <Panel
              key={service.service}
              title={<ServiceTag service={service.service} />}
              action={
                service.hasPdf ? (
                  <LinkButton href={pdfPath(view.key, service.service)} prefetch={false} variant="secondary" size="sm" icon="DownloadSimple">
                    Download PDF
                  </LinkButton>
                ) : undefined
              }
            >
              <dl className="m-0 flex flex-col gap-2 type-body">
                {service.content.figures.map((figure) => (
                  <div key={figure.label} className="flex justify-between gap-4">
                    <dt className="text-ink-3">{figure.label}</dt>
                    <dd className="m-0 text-right font-medium">{figure.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ),
        )}
      </div>
      {done.length === 0 ? null : (
        <Panel title="What we did">
          <ul className="m-0 flex list-none flex-col gap-2 p-0 type-body">
            {done.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** One month's sent reports: the month in short, a card per service, what we did. A month with no sent report is a 404. */
export async function ReportScreen({ customer, month }: { readonly customer: CustomerContext; readonly month: MonthKey }) {
  const loaded = await load("reports.month", () => loadReportMonth(customer, month));
  if (loaded.ok && loaded.data === null) notFound();
  return (
    <>
      <PageHeader
        title={monthTitle(month)}
        back={BACK}
        {...(loaded.ok && loaded.data !== null ? { description: `${customer.businessName}, sent ${formatDate(loaded.data.sentAt)}` } : {})}
      />
      {loaded.ok ? (
        loaded.data === null ? null : (
          <Report view={loaded.data} />
        )
      ) : (
        <Panel title={monthTitle(month)}>
          <PanelError failure={loaded.error} what="this report" />
        </Panel>
      )}
    </>
  );
}
