"use client";

import type { ReactNode } from "react";
import { DataTable, StatusBadge, type DataTableColumn, type InspectorContent } from "@/components";
import { formatDateTime, formatQuantity, formatRelative } from "@/lib/format";
import { Icon, LinkButton, type EmptyStateProps } from "@/ui";
import { mailHref, telHref, waitingLine, whatsappHref, type EnquiryRow } from "../rules";
import { ConversationView } from "./conversation-view";
import { EnquiryForm } from "./enquiry-form";

const ICON_LINK =
  "inline-flex size-icon-button items-center justify-center rounded-control text-ink-3 no-underline transition-colors duration-100 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function RowActions({ row }: { readonly row: EnquiryRow }) {
  const tel = telHref(row.phone);
  const wa = whatsappHref(row.phone);
  if (row.counted || (tel === null && wa === null)) return null;
  return (
    <span className="flex justify-end gap-1">
      {tel === null ? null : (
        <a href={tel} aria-label={`Call ${row.title}`} className={ICON_LINK}>
          <Icon name="Phone" size="sm" />
        </a>
      )}
      {wa === null ? null : (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${row.title}`} className={ICON_LINK}>
          <Icon name="WhatsappLogo" size="sm" />
        </a>
      )}
    </span>
  );
}

function Detail({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="type-meta">{label}</dt>
      <dd className="m-0 text-right type-body break-words">{children}</dd>
    </div>
  );
}

function inspector(row: EnquiryRow, canEdit: boolean, now: Date): InspectorContent {
  const description = (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge kind="enquiry" status={row.status} />
      <span>
        {row.source}, {formatRelative(row.receivedAt, now)}
      </span>
    </span>
  );

  if (row.counted) {
    return {
      title: row.title,
      description,
      body: (
        <>
          <div className="rounded-control bg-surface-subtle p-3 type-body">{row.message}</div>
          {row.kind === "google_call" ? null : (
            <p className="type-meta">
              Taps count towards your enquiries so you can see what your website brings in. There is nothing to reply to here: the call or chat went straight to you.
            </p>
          )}
        </>
      ),
    };
  }

  const tel = telHref(row.phone);
  const wa = whatsappHref(row.phone);
  const mail = mailHref(row.email);
  return {
    title: row.title,
    description,
    body: (
      <>
        {tel === null && wa === null && mail === null ? null : (
          <div className="flex flex-wrap gap-2">
            {tel === null ? null : (
              <LinkButton href={tel} variant="primary" icon="Phone">
                Call
              </LinkButton>
            )}
            {wa === null ? null : (
              <LinkButton href={wa} icon="WhatsappLogo" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </LinkButton>
            )}
            {mail === null ? null : (
              <LinkButton href={mail} icon="EnvelopeSimple">
                Email
              </LinkButton>
            )}
          </div>
        )}
        {row.message === "" ? null : (
          <div className="flex flex-col gap-1.5">
            <h3 className="type-sub">What they asked</h3>
            <div className="rounded-control bg-surface-subtle p-3 type-body whitespace-pre-wrap break-words">{row.message}</div>
          </div>
        )}
        <dl className="m-0 flex flex-col gap-2">
          {row.phone === null ? null : <Detail label="Phone">{row.phone}</Detail>}
          {row.email === null ? null : <Detail label="Email">{row.email}</Detail>}
          <Detail label="Source">{row.source}</Detail>
          <Detail label="Received">{formatDateTime(row.receivedAt, now)}</Detail>
        </dl>
        {row.hasConversation ? <ConversationView enquiryId={row.id} /> : null}
        {canEdit && row.status !== "counted" ? (
          <EnquiryForm row={{ ...row, status: row.status }} />
        ) : row.note === null ? null : (
          <div className="flex flex-col gap-1.5">
            <h3 className="type-sub">Private note</h3>
            <p className="type-body whitespace-pre-wrap break-words">{row.note}</p>
          </div>
        )}
      </>
    ),
  };
}

/** The list of enquiries with its inspector (`?open=id`). Owners and editors get the status and note form; viewers read. */
export function EnquiriesTable({
  rows,
  canEdit,
  now,
  empty,
  footer,
}: {
  readonly rows: readonly EnquiryRow[];
  readonly canEdit: boolean;
  readonly now: Date;
  readonly empty: EmptyStateProps;
  /** Beside the count, such as what the website's taps add up to. */
  readonly footer?: ReactNode;
}) {
  const columns: readonly DataTableColumn<EnquiryRow>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.title,
      cell: (row) => {
        const waiting = waitingLine(row, now);
        return (
          <>
            {row.title}
            {row.phone === null && waiting === null ? null : (
              <span className="block type-meta font-normal">
                {row.phone}
                {row.phone !== null && waiting !== null ? " · " : ""}
                {waiting === null ? null : <span className="text-warn-text">{waiting}</span>}
              </span>
            )}
          </>
        );
      },
    },
    { key: "source", header: "Source", sortValue: (row) => row.source, cell: (row) => row.source },
    {
      key: "message",
      header: "Message",
      priority: "low",
      cell: (row) => <span className="block max-w-80 truncate">{row.message}</span>,
    },
    { key: "received", header: "Received", sortValue: (row) => row.receivedAt, cell: (row) => formatRelative(row.receivedAt, now) },
    { key: "status", header: "Status", cell: (row) => <StatusBadge kind="enquiry" status={row.status} /> },
    { key: "reply", header: "Reply", align: "end", cell: (row) => <RowActions row={row} /> },
  ];
  return (
    <DataTable
      label="Enquiries"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      inspect={(row) => inspector(row, canEdit, now)}
      defaultSort={{ key: "received", direction: "desc" }}
      empty={empty}
      count={(n) => formatQuantity(n, "enquiry", "enquiries")}
      footer={footer}
    />
  );
}
