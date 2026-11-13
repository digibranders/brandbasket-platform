import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { REPORT_SERVICE_TITLES } from "@brandbasket/shared/lib/reports/services";
import { LIFT, SERVICE_DOT, SOFT_BUTTON } from "@/components/v2/classes";
import { PageFrame, PageSection } from "@/components/v2/page";
import { formatSentDate, pdfPath, REPORTS_PATH } from "@/lib/reports/rules";
import type { ReportMonthView, ServiceReportView } from "@/lib/server/reports";

type ReadableService = ServiceReportView & { readonly content: NonNullable<ServiceReportView["content"]> };

const isReadable = (service: ServiceReportView): service is ReadableService => service.content !== null;

function ServiceName({ service }: { readonly service: ServiceReportView["service"] }): ReactElement {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={cn("size-2 rounded-[2px]", SERVICE_DOT[service])} />
      {REPORT_SERVICE_TITLES[service]}
    </span>
  );
}

function FigureRows({ rows }: { readonly rows: readonly { readonly label: string; readonly value: string }[] }): ReactElement {
  return (
    <dl className="divide-y divide-line">
      {rows.map((row, index) => (
        <div key={`${index}-${row.label}`} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="min-w-0 break-words text-[0.9375rem] text-ink-2">{row.label}</dt>
          <dd className="shrink-0 text-right font-figure text-[0.9375rem] tabular-nums text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One month's sent reports: the month in short, a card per service, the ranked lists, what we did. */
export function ReportMonth({ view }: { readonly view: ReportMonthView }): ReactElement {
  const readable = view.services.filter(isReadable);
  const done = readable.flatMap(({ content }) => content.whatWeDid);
  return (
    <PageFrame
      title={view.title}
      lede={`Sent ${formatSentDate(view.sentAt)}`}
      action={
        <Link href={REPORTS_PATH} className={SOFT_BUTTON}>
          All reports
        </Link>
      }
    >
      {readable.length === 0 ? null : (
        <PageSection id="report-short" title="The month in short">
          <ul className="grid list-disc gap-2 pl-5 text-base text-ink">
            {readable.map(({ service, content }) => (
              <li key={service}>{content.headline}</li>
            ))}
          </ul>
        </PageSection>
      )}
      <div className="grid gap-6 md:grid-cols-3 md:gap-8">
        {view.services.map((service) => (
          <section key={service.service} aria-label={REPORT_SERVICE_TITLES[service.service]} className={cn(LIFT, "grid content-start gap-4 p-5")}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[1.0625rem] font-semibold text-ink">
                <ServiceName service={service.service} />
              </h2>
              {service.content !== null && service.hasPdf ? (
                // A plain link: the route answers with a file, so it must not be prefetched or routed client-side.
                <a href={pdfPath(view.key, service.service)} className={SOFT_BUTTON}>
                  <DownloadSimple size={18} aria-hidden="true" />
                  Download PDF
                </a>
              ) : null}
            </div>
            {service.content === null ? (
              <p role="status" className="text-[0.9375rem] text-error">
                We could not show this part of the report. Tell us and we will fix it.
              </p>
            ) : (
              <FigureRows rows={service.content.figures} />
            )}
          </section>
        ))}
      </div>
      {readable.flatMap(({ service, content }) =>
        (content.lists ?? []).map((list) => (
          <PageSection key={`${service}-${list.title}`} id={`report-${service}-${list.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} title={list.title}>
            <FigureRows rows={list.rows} />
          </PageSection>
        )),
      )}
      {done.length === 0 ? null : (
        <PageSection id="report-done" title="What we did">
          <ul className="grid gap-2 text-base text-ink">
            {done.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </PageSection>
      )}
    </PageFrame>
  );
}
