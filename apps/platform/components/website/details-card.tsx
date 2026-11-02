import type { ReactElement } from "react";
import { PageSection } from "@/components/v2/page";
import type { Detail } from "@/lib/website/history";

/** "The details": a few facts about the website, one to a row. */
export function DetailsCard({ rows }: { readonly rows: readonly Detail[] }): ReactElement {
  return (
    <PageSection id="details" title="The details">
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <dt className="text-[0.9375rem] text-ink-2">{row.label}</dt>
            <dd className="min-w-0 break-words text-right text-base font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </PageSection>
  );
}
