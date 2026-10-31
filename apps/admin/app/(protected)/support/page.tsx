import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { countSupportQueues, listAssignableSupportStaff, listSupportTicketsForStaff } from "@brandbasket/db";
import { SUPPORT_CATEGORIES } from "@brandbasket/shared/lib/support";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { replyClock, waitingLabel, type WaitingTone } from "@/lib/reply-clock";
import { readRequestFilters, requestsHref } from "@/lib/requests-filters";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "@/lib/support-admin-state";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Requests" };

const CATEGORY_OPTIONS: readonly SelectOption[] = [{ value: "", label: "Any category" }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }))];
const WAITING_CLASSES: Readonly<Record<WaitingTone, string>> = { late: "font-semibold text-error", soon: "font-semibold text-rattan-ink", ok: "text-ink-2" };

interface RequestsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RequestsPage({ searchParams }: RequestsPageProps): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const filters = readRequestFilters(await searchParams);
  const db = getStaffDb();
  const [page, counts, staff] = await Promise.all([
    listSupportTicketsForStaff(db, {
      queue: filters.queue,
      category: filters.category,
      search: filters.search,
      cursor: filters.cursor,
      assigneeStaffId: filters.mine ? user.id : undefined,
      limit: 25,
    }),
    countSupportQueues(db),
    listAssignableSupportStaff(db),
  ]);
  const now = new Date();
  const ownerName = (id: string | null): string => (id === null ? "Nobody" : staff.find((person) => person.userId === id)?.name ?? "Staff");

  return (
    <>
      <PageHeader
        title="Requests"
        meta={`${counts.needsReply + counts.waitingOnClient} open · ${counts.needsReplyOverADay} waiting over a day`}
        action={
          <Link href="/support/new" className={buttonSecondary}>
            <Plus size={16} aria-hidden="true" />
            New request for a client
          </Link>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form method="get" action="/support" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="queue" value={filters.queue} />
          {filters.mine ? <input type="hidden" name="mine" value="1" /> : null}
          <label htmlFor="requests-search" className="sr-only">
            Subject or reference
          </label>
          <input id="requests-search" name="search" type="search" maxLength={120} defaultValue={filters.search} placeholder="Subject or reference" className={`${fieldClasses} w-72`} />
          <SelectField id="requests-category" name="category" aria-label="Category" options={CATEGORY_OPTIONS} defaultValue={filters.category ?? ""} className={fieldClasses} />
          <button type="submit" className={buttonSecondary}>
            Apply
          </button>
        </form>
        <FilterPills
          label="Requests"
          options={[
            { href: requestsHref(filters, { queue: "needs_reply" }), label: "Needs reply", count: counts.needsReply, current: filters.queue === "needs_reply" },
            { href: requestsHref(filters, { queue: "waiting_on_client" }), label: "Waiting on client", count: counts.waitingOnClient, current: filters.queue === "waiting_on_client" },
            { href: requestsHref(filters, { queue: "done" }), label: "Done", count: counts.done, current: filters.queue === "done" },
            { href: requestsHref(filters, { mine: !filters.mine }), label: "Mine", current: filters.mine },
          ]}
        />
      </div>

      {page.items.length === 0 ? (
        <EmptyLine>No requests here.</EmptyLine>
      ) : (
        <TableScroll label="Requests" className="mt-6">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Request</th>
                <th className={TH}>Client</th>
                <th className={TH}>Category</th>
                <th className={TH}>Owner</th>
                <th className={`${TH} text-right`}>Waiting</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((ticket) => {
                const clock = replyClock(ticket);
                const waiting = clock.waitingSince === null ? null : waitingLabel(clock.waitingSince, now);
                return (
                  <tr key={ticket.id}>
                    <td className={TD}>
                      <Link href={`/support/${ticket.id}`} className="font-semibold hover:underline">
                        {ticket.subject}
                      </Link>
                      <small className="mt-0.5 block font-figure text-xs text-ink-2">{ticket.displayRef}</small>
                    </td>
                    <td className={TD}>{ticket.businessName ?? "No business"}</td>
                    <td className={TD}>{STAFF_SUPPORT_CATEGORY_LABELS[ticket.category]}</td>
                    <td className={`${TD} text-ink-2`}>{ownerName(ticket.assigneeStaffId)}</td>
                    <td className={`${TD_TIME} text-right`}>
                      {waiting === null ? <LocalDateTime iso={ticket.lastActivityAt.toISOString()} variant="timestamp" /> : <span className={WAITING_CLASSES[waiting.tone]}>{waiting.text}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      {page.nextCursor === null ? null : (
        <Link href={requestsHref(filters, { cursor: page.nextCursor })} className={`${buttonSecondary} mt-6`}>
          Older requests
        </Link>
      )}
    </>
  );
}
