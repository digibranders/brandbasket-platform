import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { countSupportQueues, listSupportTicketsForStaff } from "@brandbasket/db";
import { SUPPORT_CATEGORIES } from "@brandbasket/shared/lib/support";
import type { SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonSecondary } from "@/components/console/buttons";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { loadOpenRequest } from "@/components/requests/open-request";
import { RequestsWorkspace } from "@/components/requests/requests-workspace";
import { readRequestFilters } from "@/lib/requests-filters";
import { listHref } from "@/lib/requests-model";
import { getStaffDb } from "@/lib/server/db";
import { loadRequestRows } from "@/lib/server/requests-view";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "@/lib/support-admin-state";

export const metadata: Metadata = { title: "Requests" };

const CATEGORY_OPTIONS: readonly SelectOption[] = [{ value: "", label: "Any category" }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }))];

interface RequestsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Inbox, Requests: support tickets and change requests in one list, with the open request in a side panel. */
export default async function RequestsPage({ searchParams }: RequestsPageProps): Promise<ReactElement> {
  const { user, staff: viewer } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "support.list", targetType: "support_tickets" });
  const raw = await searchParams;
  const filters = readRequestFilters(raw);
  const db = getStaffDb();
  const [page, counts, open] = await Promise.all([
    listSupportTicketsForStaff(db, { queue: filters.queue, category: filters.category, search: filters.search, cursor: filters.cursor, limit: 25 }),
    countSupportQueues(db),
    loadOpenRequest({ raw: raw.open, staffUserId: user.id }),
  ]);
  const rows = await loadRequestRows(db, page.items, new Date());

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
      <SectionTabs role={viewer.role} page="/support" />
      <div className="mt-6">
        <RequestsWorkspace
          rows={rows}
          basePath="/support"
          defaultQueue="needs_reply"
          queue={filters.queue}
          search={filters.search ?? ""}
          category={filters.category ?? ""}
          counts={{ needsReply: counts.needsReply, waitingOnClient: counts.waitingOnClient, done: counts.done }}
          categoryOptions={CATEGORY_OPTIONS}
          openId={open.openId}
          detail={open.detail}
          detailFailedFor={open.detailFailedFor}
          changeSlot={open.changeSlot}
          newRequestHref="/support/new"
          nextHref={page.nextCursor === null ? null : listHref("/support", "needs_reply", { queue: filters.queue, search: filters.search, category: filters.category, cursor: page.nextCursor })}
          empty={{ title: "No requests here.", description: "Requests from customers appear here with how long each has been waiting." }}
        />
      </div>
    </>
  );
}
