"use client";

import { EnvelopeSimple, Phone, WhatsappLogo, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { formatTimestamp } from "@brandbasket/shared/lib/format";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { mailHref, telHref, whatsappHref, type EnquiryRow } from "@/lib/enquiries/rules";
import { ConversationPanel } from "./conversation-panel";
import { EnquiryForm } from "./enquiry-form";
import { StatusWord } from "./status-word";

const ICON_LINK =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink";

const when = (date: Date): string => formatTimestamp(date, "Asia/Kolkata");

function RowButtons({ row }: { readonly row: EnquiryRow }): ReactElement | null {
  const tel = telHref(row.phone);
  const wa = whatsappHref(row.phone);
  if (tel === null && wa === null) return null;
  return (
    <span className="flex shrink-0">
      {tel === null ? null : (
        <a href={tel} aria-label={`Call ${row.title}`} className={ICON_LINK}>
          <Phone size={18} aria-hidden="true" />
        </a>
      )}
      {wa === null ? null : (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${row.title}`} className={ICON_LINK}>
          <WhatsappLogo size={18} aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

function Detail({ row, canEdit }: { readonly row: EnquiryRow; readonly canEdit: boolean }): ReactElement {
  const tel = telHref(row.phone);
  const wa = whatsappHref(row.phone);
  const mail = mailHref(row.email);
  return (
    <div className="grid gap-5">
      {row.counted ? (
        <>
          <p className="rounded-control bg-sunken p-3 text-[0.9375rem] text-ink">{row.message}</p>
          {row.kind === "google_call" ? null : (
            <p className="text-sm text-ink-2">Taps count towards your enquiries so you can see what your website brings in. There is nothing to reply to here.</p>
          )}
        </>
      ) : (
        <>
          {tel === null && wa === null && mail === null ? null : (
            <div className="flex flex-wrap gap-2">
              {tel === null ? null : (
                <a href={tel} className={SOFT_BUTTON}>
                  <Phone size={18} aria-hidden="true" />
                  Call
                </a>
              )}
              {wa === null ? null : (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
                  <WhatsappLogo size={18} aria-hidden="true" />
                  WhatsApp
                </a>
              )}
              {mail === null ? null : (
                <a href={mail} className={SOFT_BUTTON}>
                  <EnvelopeSimple size={18} aria-hidden="true" />
                  Email
                </a>
              )}
            </div>
          )}
          {row.message === "" ? null : (
            <div className="grid gap-1.5">
              <h3 className="text-[0.9375rem] font-semibold text-ink">What they asked</h3>
              <p className="whitespace-pre-wrap break-words rounded-control bg-sunken p-3 text-[0.9375rem] text-ink">{row.message}</p>
            </div>
          )}
          <dl className="grid gap-2 text-[0.9375rem]">
            {row.phone === null ? null : (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Phone</dt>
                <dd className="m-0 break-words text-right text-ink">{row.phone}</dd>
              </div>
            )}
            {row.email === null ? null : (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Email</dt>
                <dd className="m-0 break-words text-right text-ink">{row.email}</dd>
              </div>
            )}
          </dl>
          {row.chatLeadId === null ? null : <ConversationPanel leadId={row.chatLeadId} />}
          {canEdit && row.status !== "counted" ? (
            <EnquiryForm row={{ ...row, status: row.status }} />
          ) : row.note === null ? null : (
            <div className="grid gap-1.5">
              <h3 className="text-[0.9375rem] font-semibold text-ink">Private note</h3>
              <p className="whitespace-pre-wrap break-words text-[0.9375rem] text-ink">{row.note}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EnquiryDialog({ row, canEdit, onClose }: { readonly row: EnquiryRow; readonly canEdit: boolean; readonly onClose: () => void }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1rem),40rem)] overflow-hidden rounded-lg bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/60"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words font-display text-lg font-semibold tracking-[-0.01em]">
              {row.title}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
              <StatusWord status={row.status} />
              <span>
                {row.source}, {when(row.receivedAt)}
              </span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors duration-200 hover:bg-sunken hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:px-7">
          <Detail row={row} canEdit={canEdit} />
        </div>
      </div>
    </dialog>
  );
}

/**
 * The unified list: chats, forms, ad leads and counted taps, newest first. Selecting a row opens its detail with the contact
 * buttons, the conversation for a chat, and (for owners and editors) the status and private note.
 */
export function EnquiryList({ rows, canEdit }: { readonly rows: readonly EnquiryRow[]; readonly canEdit: boolean }): ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((row) => row.id === openId) ?? null;
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpenId(row.id)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-3.5 text-left transition-colors duration-200 hover:bg-sunken/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-ink">{row.title}</span>
                {row.message === "" ? null : <span className="block truncate text-[0.9375rem] text-ink-2">{row.message}</span>}
                <span className="block text-[0.8125rem] text-ink-2">
                  {row.source}, {when(row.receivedAt)}
                </span>
              </span>
              <StatusWord status={row.status} />
            </button>
            <RowButtons row={row} />
          </li>
        ))}
      </ul>
      {open === null ? null : <EnquiryDialog key={open.id} row={open} canEdit={canEdit} onClose={() => setOpenId(null)} />}
    </>
  );
}
