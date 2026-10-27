import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { fieldClasses } from "@/components/console/field-styles";
import { Figures } from "@/components/console/figures";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { deliveriesHref, deliveryFigures, deliveryTotals, DELIVERY_SOURCES, readDeliveryFilter, SOURCE_LABELS, type DeliveryOutcome } from "@/lib/deliveries-view";
import { resendNotice } from "@/lib/deliveries-notices";
import { loadDeliveries } from "@/lib/server/deliveries";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendAlertAction, resendAllFailedAction, resendEmailAction } from "./actions";

export const metadata: Metadata = { title: "Deliveries" };

const PILL: Readonly<Record<DeliveryOutcome, PillTone>> = { ok: "done", quiet: "todo", failed: "problem" };

interface DeliveriesSearch {
  readonly result?: string;
  readonly direction?: string;
  readonly source?: string;
  readonly q?: string;
  readonly resent?: string;
  readonly resentAll?: string;
}

export default async function DeliveriesPage({ searchParams }: { readonly searchParams: Promise<DeliveriesSearch> }): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const search = await searchParams;
  const filter = readDeliveryFilter(search);
  await logStaffAccess({ staffUserId: user.id, action: "delivery.view", targetType: "deliveries" });
  const { health, rows } = await loadDeliveries(filter, new Date());
  const totals = deliveryTotals(health);
  const notice = resendNotice(search);

  return (
    <>
      <PageHeader
        title="Deliveries"
        lead={`Last 24 hours · ${totals.in} in, ${totals.out} out · ${totals.failed} failed`}
        action={
          totals.failed === 0 ? null : (
            <form action={resendAllFailedAction}>
              <button type="submit" className={buttonSecondary}>
                Resend all failed
              </button>
            </form>
          )
        }
      />
      {notice === null ? null : (
        <Notice tone={notice.tone} className="mt-4">
          {notice.text}
        </Notice>
      )}

      <Figures items={deliveryFigures(health)} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form method="get" action="/deliveries" role="search" className="min-w-72">
          {filter.failedOnly ? <input type="hidden" name="result" value="failed" /> : null}
          {filter.direction === null ? null : <input type="hidden" name="direction" value={filter.direction} />}
          {filter.source === null ? null : <input type="hidden" name="source" value={filter.source} />}
          <input
            type="search"
            name="q"
            defaultValue={filter.search ?? ""}
            placeholder="Event, client, address or id"
            aria-label="Search deliveries"
            maxLength={100}
            className={fieldClasses}
          />
        </form>
        <FilterPills
          label="Filter by result and direction"
          options={[
            { href: deliveriesHref(filter, { failedOnly: false, direction: null }), label: "All", count: totals.in + totals.out, current: !filter.failedOnly && filter.direction === null },
            { href: deliveriesHref(filter, { failedOnly: true }), label: "Failed", count: totals.failed, current: filter.failedOnly },
            { href: deliveriesHref(filter, { direction: "in" }), label: "Coming in", current: filter.direction === "in" },
            { href: deliveriesHref(filter, { direction: "out" }), label: "Going out", current: filter.direction === "out" },
          ]}
        />
      </div>
      <div className="mt-3">
        <FilterPills
          label="Filter by source"
          options={[
            { href: deliveriesHref(filter, { source: null }), label: "Any source", current: filter.source === null },
            ...DELIVERY_SOURCES.map((source) => ({ href: deliveriesHref(filter, { source }), label: SOURCE_LABELS[source], current: filter.source === source })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyLine>Nothing matches these filters.</EmptyLine>
        </div>
      ) : (
        <section aria-label="Deliveries" className={`${LIFT} mt-6 overflow-x-auto px-4`}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Source</th>
                <th className={TH}>Event</th>
                <th className={TH}>Client or address</th>
                <th className={TH}>Result</th>
                <th className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.source}:${row.id}`}>
                  <td className={TD_TIME}>
                    <LocalDateTime iso={row.at.toISOString()} variant="timestamp" />
                  </td>
                  <td className={`${TD} font-semibold`}>{SOURCE_LABELS[row.source]}</td>
                  <td className={TD}>
                    {row.eventIsCode ? <code className="rounded-md bg-sunken px-1.5 py-0.5 font-figure text-xs">{row.event}</code> : row.event}
                  </td>
                  <td className={TD}>{row.target ?? <span className="text-ink-2">Not linked</span>}</td>
                  <td className={TD}>
                    <StatusPill tone={PILL[row.outcome]}>{row.resultLabel}</StatusPill>
                    {row.detail === null ? null : <span className="mt-1 block max-w-80 text-xs text-ink-2">{row.detail}</span>}
                  </td>
                  <td className={`${TD} text-right`}>
                    {row.resend === null ? (
                      <Link href={row.href} className={buttonSmall}>
                        Details
                      </Link>
                    ) : (
                      <form action={row.resend === "email" ? resendEmailAction : resendAlertAction} className="inline">
                        <input type="hidden" name="deliveryId" value={row.id} />
                        <input type="hidden" name="from" value="list" />
                        <button type="submit" className={buttonSmall}>
                          Resend
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
