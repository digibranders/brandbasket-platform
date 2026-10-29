import type { ReactElement } from "react";
import { FactRows, PageSection } from "@/components/v2/page";
import type { FirstPaymentView } from "@/lib/server/first-look";
import type { BoughtRow } from "@/lib/website/bought";

/** What the plan pays for, one row a service with its date, and the first payment with its receipt. Nothing here is worked out: it is what was stored. */
export function BoughtSection({ rows, payment }: { readonly rows: readonly BoughtRow[]; readonly payment: FirstPaymentView | null }): ReactElement {
  const items = [
    ...rows.map((row) => ({ label: row.name, value: row.note })),
    ...(payment === null ? [] : [{ label: "First payment", value: <span className="tabular-nums">{`${payment.amount} on ${payment.paidOn}`}</span> }]),
  ];
  return (
    <PageSection
      id="bought"
      title="What you bought"
      aside={
        payment === null ? undefined : (
          <a href={payment.receiptHref} className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-[3px]">
            Receipt
          </a>
        )
      }
    >
      <FactRows items={items} />
    </PageSection>
  );
}
