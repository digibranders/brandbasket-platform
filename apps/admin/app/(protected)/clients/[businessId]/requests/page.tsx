import { listActivityForBusiness, listAssignableSupportStaff, listSupportTicketsForStaff } from "@brandbasket/db";
import { SUPPORT_CATEGORIES } from "@brandbasket/shared/lib/support";
import type { SelectOption } from "@brandbasket/shared/ui/select-field";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { z } from "zod";
import { ActivityList } from "@/components/activity-list";
import { CallsSection } from "@/components/console/calls-section";
import { Fold } from "@/components/console/fold";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { loadOpenRequest } from "@/components/requests/open-request";
import { RequestsWorkspace } from "@/components/requests/requests-workspace";
import { readCallsNotice } from "@/lib/call-form";
import { listHref, readClientQueue } from "@/lib/requests-model";
import { readMailOutcome, readRequestActionNotice, requestActionLine } from "@/lib/request-notices";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { loadRequestRows } from "@/lib/server/requests-view";
import { STAFF_SUPPORT_CATEGORY_LABELS } from "@/lib/support-admin-state";

export const metadata: Metadata = { title: "Client messages" };

/** The most one support page returns (supportPageLimit). */
const REQUESTS_SHOWN = 25;

/** How much history the Activity fold shows. */
const ACTIVITY_SHOWN = 200;

const CATEGORY_OPTIONS: readonly SelectOption[] = [{ value: "", label: "Any category" }, ...SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }))];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** A client's Requests tab: the Inbox list with this client fixed, the same component, then calls and activity. */
export default async function ClientRequestsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "requests");
  const sp = await searchParams;
  const queue = readClientQueue(sp.queue);
  const search = first(sp.search).trim().slice(0, 120);
  const category = SUPPORT_CATEGORIES.find((value) => value === first(sp.category)) ?? "";
  const cursor = z.uuid().safeParse(first(sp.cursor)).data ?? "";
  const db = getStaffDb();
  const basePath = `/clients/${client.businessId}/requests`;
  const [page, activity, staff, open] = await Promise.all([
    listSupportTicketsForStaff(db, {
      businessId: client.businessId,
      limit: REQUESTS_SHOWN,
      ...(queue === "all" ? {} : { queue }),
      ...(category === "" ? {} : { category }),
      ...(search === "" ? {} : { search }),
      ...(cursor === "" ? {} : { cursor }),
    }),
    listActivityForBusiness(db, client.businessId, ACTIVITY_SHOWN),
    listAssignableSupportStaff(db),
    loadOpenRequest({ raw: sp.open, staffUserId: granted.user.id, onlyBusinessId: client.businessId }),
  ]);
  const rows = await loadRequestRows(db, page.items, new Date());
  const notice = readRequestActionNotice(sp.requests);
  const line = notice === null ? null : requestActionLine(notice, readMailOutcome(sp.mail));

  return (
    <>
      <Section title="Requests" id="requests" aside={page.nextCursor === null ? undefined : `The ${REQUESTS_SHOWN} newest`}>
        {line === null ? null : (
          <Notice tone={line.ok ? "ok" : "problem"} className="mb-4">
            {line.text}
          </Notice>
        )}
        <RequestsWorkspace
          rows={rows}
          basePath={basePath}
          defaultQueue="all"
          queue={queue}
          search={search}
          category={category}
          counts={null}
          categoryOptions={CATEGORY_OPTIONS}
          openId={open.openId}
          detail={open.detail}
          detailFailedFor={open.detailFailedFor}
          changeSlot={open.changeSlot}
          newRequestHref={`/support/new?businessId=${client.businessId}`}
          nextHref={page.nextCursor === null ? null : listHref(basePath, "all", { queue, search, category, cursor: page.nextCursor })}
          empty={{ title: "No requests from this client.", description: "Their requests appear here as they send them." }}
        />
      </Section>
      <CallsSection businessId={client.businessId} notice={readCallsNotice(sp.calls)} />
      <Fold title="Activity">
        <div id="activity" className="scroll-mt-8">
          {activity.length === ACTIVITY_SHOWN ? <p className="mb-3 text-xs font-semibold text-ink-2">The {ACTIVITY_SHOWN} newest</p> : null}
          <ActivityList rows={activity} staffNames={new Map(staff.map((member) => [member.userId, member.name]))} />
        </div>
      </Fold>
    </>
  );
}
