import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { RequestDetail } from "@/components/requests/request-detail";
import { RequestsView } from "@/components/requests/requests-view";
import { paymentNoticeLine, readRequestNotice, requestNoticeLine } from "@/lib/requests/notices";
import { chooseView, requestRows } from "@/lib/requests/rows";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadBookCallOptions } from "@/lib/server/calls";
import { loadRequestDetail, loadRequests } from "@/lib/server/requests";

export const metadata: Metadata = { title: "Requests" };

interface RequestsPageProps {
  readonly searchParams: Promise<{
    readonly open?: string | readonly string[];
    readonly filter?: string | readonly string[];
    readonly notice?: string | readonly string[];
    readonly charge?: string | readonly string[];
  }>;
}

const one = (value: string | readonly string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

export default async function RequestsPage({ searchParams }: RequestsPageProps): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess();
  const params = await searchParams;
  const asked = one(params.open);
  if (asked !== undefined && !z.uuid().safeParse(asked).success) notFound();
  const [data, calls] = await Promise.all([loadRequests(tenant, billing.hasWebsite), loadBookCallOptions(tenant, billing, user.email)]);
  const rows = requestRows(data.items);
  const view = chooseView(rows, { filter: one(params.filter), open: asked });
  const detail = view.selectedId === null ? null : await loadRequestDetail(tenant, view.selectedId);
  // An address that names a request this person does not have is not found, whoever's request it is.
  if (asked !== undefined && detail === null) notFound();
  const notice = readRequestNotice(params.notice);
  return (
    <RequestsView
      rows={rows}
      listed={view.listed}
      filter={view.filter}
      selectedId={view.selectedId}
      explicit={view.explicit}
      calls={calls}
      detail={
        detail === null ? null : (
          <RequestDetail
            detail={detail}
            now={new Date()}
            submissionKey={randomUUID()}
            notice={notice === null ? paymentNoticeLine(params.charge) : requestNoticeLine(notice)}
            calls={calls}
          />
        )
      }
    />
  );
}
