"use client";

import type { ReactNode } from "react";
import { DataTable, StatusBadge, type DataTableColumn, type InspectorContent } from "@/components";
import { formatQuantity, formatRelative } from "@/lib/format";
import { LinkButton, ServiceTag } from "@/ui";
import { requestPath, type RequestRow } from "../rules";
import { DetailsList } from "./details-list";

export function RowStatus({ row }: { readonly row: RequestRow }) {
  return <StatusBadge kind="request" status={row.status} />;
}

const COLUMNS: readonly DataTableColumn<RequestRow>[] = [
  {
    key: "request",
    header: "Request",
    cell: (row) => (
      <>
        {row.title}
        {row.tone === "waiting" && row.word !== "Waiting for you" ? <span className="block type-meta text-warn-text">Waiting for you</span> : null}
      </>
    ),
  },
  { key: "service", header: "Service", priority: "low", cell: (row) => (row.service === null ? row.kindLabel : <ServiceTag service={row.service} />) },
  { key: "status", header: "Status", cell: (row) => <RowStatus row={row} /> },
  { key: "updated", header: "Updated", priority: "low", sortValue: (row) => row.lastActivityAt, cell: (row) => formatRelative(row.lastActivityAt) },
];

function inspect(row: RequestRow): InspectorContent {
  return {
    title: row.title,
    description: <RowStatus row={row} />,
    body: (
      <>
        <DetailsList
          rows={[
            ["Service", row.kindLabel],
            ["Updated", formatRelative(row.lastActivityAt)],
          ]}
        />
        {row.quoteTotal === null ? null : <p className="type-body">Quote {row.quoteTotal}, waiting for your answer.</p>}
      </>
    ),
    footer: (
      <LinkButton href={requestPath(row.ticketId)} variant="primary">
        Open request
      </LinkButton>
    ),
  };
}

/** The list of requests. A row opens its sheet at `?open=<ticket id>`, the link old emails and the bell use. */
export function RequestsTable({ rows, empty }: { readonly rows: readonly RequestRow[]; readonly empty: { readonly title: string; readonly description: string; readonly action?: ReactNode } }) {
  return (
    <DataTable
      label="Requests"
      rows={rows}
      columns={COLUMNS}
      rowKey={(row) => row.ticketId}
      inspect={inspect}
      empty={{ icon: "ChatCircleDots", ...empty }}
      count={(n) => formatQuantity(n, "request")}
    />
  );
}
