import type { ReactElement, ReactNode } from "react";
import type { PatientReport } from "@firstfold/db";

/** The row of big numbers at the top of Reports. */
export function ReportNumbers({ report }: { readonly report: PatientReport }): ReactElement {
  const figures: readonly { readonly label: string; readonly value: ReactNode }[] = [
    { label: "New patients", value: String(report.newPatients) },
    { label: "Returning", value: String(report.returningPatients) },
    { label: "Visits", value: String(report.visits) },
    {
      label: "No-show rate",
      // No attended visits and no no-shows: there is no rate, which is not the same as 0%.
      value:
        report.noShowRate === null ? (
          <>
            <span aria-hidden="true">–</span>
            <span className="sr-only">None yet</span>
          </>
        ) : (
          `${String(Math.round(report.noShowRate * 100))}%`
        ),
    },
    { label: "Cancellations", value: String(report.cancellations) },
  ];

  return (
    <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((figure) => (
        <div key={figure.label} className="flex flex-col-reverse gap-1">
          <dt className="text-sm text-ink-soft">{figure.label}</dt>
          <dd className="heading-display text-5xl text-ink tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
