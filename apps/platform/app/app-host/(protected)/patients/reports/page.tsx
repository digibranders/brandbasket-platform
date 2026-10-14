import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { findBusinessTimeZone, readPatientReport, withTenantScope } from "@fynix/db";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import { cn } from "@fynix/shared/lib/cn";
import { ReportMonthChart, ReportHourChart, ReportWeekdayChart } from "@/components/panel/patients/report-charts";
import { ReportDoctors } from "@/components/panel/patients/report-doctors";
import { ReportNumbers } from "@/components/panel/patients/report-numbers";
import { ReportSplitBar } from "@/components/panel/patients/report-split-bar";
import { parseReportRange, REPORT_RANGE_KEYS, REPORT_RANGE_LABELS, type ReportRangeKey } from "@/lib/patients/report-range";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Reports" };

/** "By doctor" only earns its place once there is more than one doctor to compare. */
const MIN_DOCTORS_FOR_TABLE = 2;

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

interface ReportsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function rangeHref(key: ReportRangeKey): string {
  return key === "month" ? "/patients/reports" : `/patients/reports?range=${key}`;
}

/** "1 Jul – 29 Sep 2026", with the first year too when the range starts in an earlier one. */
function formatSpan(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const fromYear = from.slice(0, 4);
  const toYear = to.slice(0, 4);
  const startLabel = fromYear === toYear ? DAY_MONTH.format(start) : `${DAY_MONTH.format(start)} ${fromYear}`;
  return from === to ? `${DAY_MONTH.format(end)} ${toYear}` : `${startLabel} – ${DAY_MONTH.format(end)} ${toYear}`;
}

function ReportSection({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="panel-section">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function PatientReportsPage({ searchParams }: ReportsPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });
  const sp = await searchParams;
  const now = new Date();

  const { range, report } = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const timeZone = (await findBusinessTimeZone(tx, tenant.businessId)) ?? "UTC";
    const parsed = parseReportRange(sp.range, localDateIn(timeZone, now));
    const read = await readPatientReport(tx, { from: parsed.from, to: parsed.to, monthsEndingAt: parsed.to, timeZone });
    return { range: parsed, report: read };
  });

  const hasBookings = report.bookings > 0;
  const hasMonths = report.months.some((entry) => entry.newPatients > 0 || entry.visits > 0);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="panel-title">Reports</h1>
        <Link href="/patients" className="link-underline text-sm font-medium text-ink">
          Back to patients
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <nav aria-label="Range" className="flex flex-wrap gap-1">
          {REPORT_RANGE_KEYS.map((key) => (
            <Link
              key={key}
              href={rangeHref(key)}
              aria-current={key === range.key ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm",
                key === range.key ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
              )}
            >
              {REPORT_RANGE_LABELS[key]}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-ink-soft">{formatSpan(range.from, range.to)}</p>
      </div>

      <ReportNumbers report={report} />

      <ReportSection title="By month">
        {hasMonths ? <ReportMonthChart months={report.months} /> : <p className="text-sm text-ink-soft">Nothing in the last 12 months.</p>}
      </ReportSection>

      {hasBookings ? (
        <>
          <ReportSection title="Busiest days">
            <ReportWeekdayChart weekdays={report.weekdays} />
          </ReportSection>
          <ReportSection title="Busiest hours">
            <ReportHourChart hours={report.hours} />
          </ReportSection>
          {report.practitioners.length >= MIN_DOCTORS_FOR_TABLE ? (
            <ReportSection title="By doctor">
              <ReportDoctors doctors={report.practitioners} />
            </ReportSection>
          ) : null}
          <ReportSection title="Online vs clinic">
            <ReportSplitBar online={report.online} clinic={report.clinic} />
          </ReportSection>
        </>
      ) : (
        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-soft">No bookings in this range.</p>
      )}
    </>
  );
}
