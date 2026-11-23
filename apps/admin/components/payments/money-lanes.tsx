import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSmall } from "@/components/console/buttons";
import { Quiet, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { RENEWAL_STATE_LABELS, type RenewalRow } from "@/lib/money-attention";

export interface AttentionItem {
  readonly key: string;
  readonly client: string;
  /** What is wrong, in words. */
  readonly title: string;
  readonly amount: string;
  readonly href: string;
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/** Payments that arrived and bought nothing, and payments that failed: each opens its panel. Nothing to show draws nothing. */
export function NeedsALookStrip({ items }: { readonly items: readonly AttentionItem[] }): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <Section title="Needs a look" aside={`${plural(items.length, "payment", "payments")} to open`} tone="attention" className="mt-4">
      <ul aria-label="Payments that need a look" className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <span className="min-w-0">
              <span className="block font-semibold">{item.client}</span>
              <span className="block text-sm text-ink-2">{item.title}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-figure text-sm tabular-nums">{item.amount}</span>
              <Link href={item.href} className={buttonSmall}>
                Open
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function overdueText(days: number | null): string {
  if (days === null) return "Not known";
  return days === 0 ? "Today" : `${days}d`;
}

interface RenewalsLaneProps {
  readonly rows: readonly RenewalRow[];
  /** False when the clients could not be read: the lane says so instead of claiming nothing is overdue. */
  readonly readFailed: boolean;
  /** The lapse policy line, which the page already states. */
  readonly policy: string;
}

/** Plans past due or lapsed, the longest overdue first: the same rows the Today queue shows as billing work. */
export function RenewalsLane({ rows, readFailed, policy }: RenewalsLaneProps): ReactElement {
  return (
    <Section title="Renewals and overdue" aside={readFailed ? "Could not be read" : plural(rows.length, "plan", "plans")} tone={rows.length > 0 ? "attention" : "plain"} className="mt-2">
      {readFailed ? (
        <Quiet>The plans could not be read, so nothing is claimed about renewals. Reload the page to try again.</Quiet>
      ) : rows.length === 0 ? (
        <Quiet>No plan is past due or lapsed.</Quiet>
      ) : (
        <ul aria-label="Plans past due or lapsed" className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.businessId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">{row.businessName}</span>
                <span className="block text-sm text-ink-2">
                  {row.paidThroughAt === null ? "No paid period recorded" : `Paid through ${row.paidThroughAt.toISOString().slice(0, 10)}`}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <StatusPill tone="problem">{RENEWAL_STATE_LABELS[row.state]}</StatusPill>
                <span className="font-figure text-sm tabular-nums">{overdueText(row.daysOverdue)}</span>
                <Link href={row.href} className={buttonSmall}>
                  Open client money
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-2">{policy}</p>
    </Section>
  );
}
