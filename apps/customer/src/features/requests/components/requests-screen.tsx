import type { ReactNode } from "react";
import { FilterBar, PageHeader, Panel, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import { Banner, LinkButton } from "@/ui";
import {
  canWrite,
  filterRows,
  KIND_LABELS,
  kindsPresent,
  NEW_REQUEST_PATH,
  statusCounts,
  type NoticeLine,
  type RequestRow,
  type ServiceFilter,
  type StatusFilter,
} from "../rules";
import { RequestsTable } from "./requests-table";

const EMPTY_FILTERED: Readonly<Record<StatusFilter, { readonly title: string; readonly description: string }>> = {
  all: { title: "No requests for this service", description: "Requests about it appear here as soon as you send one." },
  waiting: { title: "Nothing is waiting for you", description: "A quote to answer or a change to check will appear here." },
  open: { title: "Nothing is open", description: "Requests we are working on appear here." },
  done: { title: "Nothing is done yet", description: "Finished requests appear here." },
};

export interface RequestsScreenProps {
  readonly customer: CustomerContext;
  readonly rows: Loaded<readonly RequestRow[]>;
  /** "Small edits included this month: 1 of 2 used.", when it could be read and the plan has them. */
  readonly includedLine: string | null;
  readonly status: StatusFilter;
  readonly service: ServiceFilter;
  /** The request whose sheet is open, so a filter never hides it. */
  readonly open: string | undefined;
  readonly notice: NoticeLine | null;
  /** The new request dialog, when the customer may send one. */
  readonly dialog: ReactNode;
}

export function RequestsScreen({ customer, rows, includedLine, status, service, open, notice, dialog }: RequestsScreenProps) {
  const canCreate = customer.billing.hasAccess && canWrite(customer.role);
  const newRequest = canCreate ? (
    <LinkButton href={NEW_REQUEST_PATH} variant="primary" icon="Plus">
      New request
    </LinkButton>
  ) : undefined;
  const intro = "Ask for a change, send us something, or ask a question.";

  return (
    <>
      <PageHeader title="Requests" description={includedLine === null ? intro : `${intro} ${includedLine}`} actions={newRequest} />
      {notice === null ? null : (
        <Banner tone={notice.ok ? "pos" : "neg"} className="mb-4">
          {notice.text}
        </Banner>
      )}
      {!rows.ok ? (
        <Panel title="Requests">
          <PanelError failure={rows.error} what="your requests" />
        </Panel>
      ) : (
        <Panel flush>
          {rows.data.length === 0 ? null : (
            <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3">
              <FilterBar
                label="Status"
                defaultValue="all"
                options={[
                  { value: "all", label: "All", count: statusCounts(rows.data, service).all },
                  { value: "waiting", label: "Waiting for you", count: statusCounts(rows.data, service).waiting },
                  { value: "open", label: "Open", count: statusCounts(rows.data, service).open },
                  { value: "done", label: "Done", count: statusCounts(rows.data, service).done },
                ]}
              />
              {kindsPresent(rows.data).length < 2 ? null : (
                <FilterBar
                  label="Service"
                  param="service"
                  defaultValue="all"
                  options={[{ value: "all", label: "All services" }, ...kindsPresent(rows.data).map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))]}
                />
              )}
            </div>
          )}
          <RequestsTable
            rows={shown(rows.data, status, service, open)}
            empty={
              rows.data.length === 0
                ? {
                    title: "No requests yet",
                    description: "Ask a question, send us information or ask for a change. Follow it here, from our first reply to the day it is done.",
                    action: newRequest,
                  }
                : EMPTY_FILTERED[service === "all" ? status : "all"]
            }
          />
        </Panel>
      )}
      {canCreate ? dialog : null}
    </>
  );
}

/** The rows the filters leave, or every row when the open request would be hidden by them. */
function shown(rows: readonly RequestRow[], status: StatusFilter, service: ServiceFilter, open: string | undefined): readonly RequestRow[] {
  const filtered = filterRows(rows, status, service);
  return open === undefined || filtered.some((row) => row.ticketId === open) ? filtered : rows;
}
