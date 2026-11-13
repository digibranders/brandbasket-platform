import type { ReactElement } from "react";
import type { Summary } from "@/lib/enquiries/rules";

/** Where the list stands: people still waiting for a reply, what came in over the last 30 days, and what became a customer. */
export function EnquiryFigures({ summary }: { readonly summary: Summary }): ReactElement {
  const figures = [
    { label: "Waiting for a reply", value: summary.waiting },
    { label: "Received, last 30 days", value: summary.received },
    { label: "Won, last 30 days", value: summary.won },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-line">
      {figures.map((figure) => (
        <div key={figure.label} className="px-4 first:pl-0 sm:px-6">
          <dt className="text-[0.8125rem] text-ink-2">{figure.label}</dt>
          <dd className="mt-1 font-figure text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
