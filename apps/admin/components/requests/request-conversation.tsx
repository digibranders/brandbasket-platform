"use client";

import { useToast, useConfirmRun } from "@brandbasket/shared/ui/patterns";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import Link from "next/link";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { addMessage } from "@/app/(protected)/support/[ticketId]/actions";
import { reopenTicketAction } from "@/app/(protected)/support/status-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses } from "@/components/console/field-styles";
import type { ThreadBanner } from "@/lib/requests-model";
import type { RequestDetail } from "@/lib/server/requests-view";
import { STAFF_SUPPORT_INITIAL_STATE } from "@/lib/support-admin-state";
import { RequestChips } from "./request-chips";
import { useRequestStatus } from "./use-request-status";

const BANNER_CLASSES: Readonly<Record<ThreadBanner["tone"], string>> = {
  late: "bg-error-wash text-error",
  soon: "bg-rattan-soft text-rattan-ink",
  ok: "bg-sage-wash text-sage-text",
  neutral: "bg-sunken text-ink",
};

export interface RequestComposer {
  readonly body: string;
  readonly setBody: (text: string) => void;
  /** Moves the cursor to the reply box (the `r` key). */
  readonly focusReply: () => void;
  readonly busy: boolean;
  readonly replyLabel: string;
  readonly replyDisabledReason: string | undefined;
  readonly sendReply: () => void;
  readonly addNote: () => void;
  readonly toggleClosed: () => void;
  readonly closeLabel: string;
  readonly closeDisabledReason: string | undefined;
  /** Render once next to the buttons: the confirm dialog for a reply. */
  readonly dialog: ReactElement | null;
}

/**
 * Reply, note, close and reopen for one request. A public reply emails the requester, so it asks first and has no undo.
 * An internal note and a status change email nobody: the note is saved at once, close and reopen show a toast with Undo.
 */
export function useRequestComposer(detail: RequestDetail | null, onChanged: () => void): RequestComposer {
  const { show } = useToast();
  const status = useRequestStatus(onChanged);
  const confirm = useConfirmRun();
  const keyRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<{ readonly forId: string; readonly text: string }>({ forId: "", text: "" });
  const [busy, setBusy] = useState(false);

  const body = detail !== null && draft.forId === detail.id ? draft.text : "";
  const closed = detail?.status === "closed";
  const resolved = detail?.status === "resolved";
  const finished = closed || resolved;

  const submit = async (visibility: "public" | "internal"): Promise<void> => {
    if (detail === null || body.trim() === "") return;
    setBusy(true);
    try {
      if (visibility === "public" && resolved) {
        const reopened = await reopenTicketAction(detail.id);
        if (!reopened.ok) {
          show({ message: reopened.message, tone: "error" });
          return;
        }
      }
      keyRef.current ??= crypto.randomUUID();
      const form = new FormData();
      form.set("body", body);
      form.set("visibility", visibility);
      form.set("submissionKey", keyRef.current);
      const result = await addMessage(detail.id, STAFF_SUPPORT_INITIAL_STATE, form);
      if (result.kind === "saved") {
        keyRef.current = null;
        setDraft({ forId: detail.id, text: "" });
        show({ message: result.message ?? "Saved." });
      } else {
        if (result.kind === "conflict") keyRef.current = null;
        show({ message: result.message ?? "The message did not save. Your text is kept.", tone: "error" });
      }
      onChanged();
    } catch {
      show({ message: "The message did not save. Your text is kept. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const requester = detail?.requester?.name ?? "the requester";
  return {
    body,
    setBody: (text) => {
      if (detail !== null) setDraft({ forId: detail.id, text });
    },
    focusReply: () => document.getElementById(`reply-${detail?.id ?? ""}`)?.focus(),
    busy: busy || status.busyId !== null,
    replyLabel: resolved ? "Reopen and reply" : "Send reply",
    replyDisabledReason: closed ? "A closed request cannot get a public reply. Add an internal note." : body.trim() === "" ? "Write a reply first." : undefined,
    sendReply: () => {
      if (detail === null) return;
      confirm.request(
        {
          title: `Send this reply to ${requester}?`,
          consequence: resolved ? `The request is reopened and ${requester} is emailed straight away. A sent reply cannot be unsent.` : `${requester} is emailed straight away. A sent reply cannot be unsent.`,
          confirmLabel: resolved ? "Reopen and send" : "Send reply",
        },
        () => void submit("public"),
      );
    },
    addNote: () => void submit("internal"),
    toggleClosed: () => {
      if (detail === null) return;
      void (finished ? status.reopen(detail.id) : status.close(detail.id));
    },
    closeLabel: finished ? "Reopen" : "Close",
    closeDisabledReason: closed ? "A closed request cannot be reopened here." : undefined,
    dialog: confirm.dialog,
  };
}

/** Add internal note and Close or Reopen: the secondary buttons beside the one primary, Send reply. */
export function ComposerActions({ composer }: { readonly composer: RequestComposer }): ReactElement {
  return (
    <>
      <button type="button" className={buttonSecondary} disabled={composer.busy || composer.body.trim() === ""} onClick={composer.addNote}>
        Add internal note
      </button>
      <button type="button" className={buttonSecondary} disabled={composer.busy || composer.closeDisabledReason !== undefined} title={composer.closeDisabledReason} onClick={composer.toggleClosed}>
        {composer.closeLabel}
      </button>
      {composer.dialog}
    </>
  );
}

/** The conversation, oldest first, then the reply box beside the newest message. */
export function ConversationBody({ detail, composer, children }: { readonly detail: RequestDetail; readonly composer: RequestComposer; readonly children?: ReactNode }): ReactElement {
  const requester = detail.requester?.name ?? "the requester";
  return (
    <>
      <RequestChips chips={detail.chips} extra={detail.categoryLabel} />
      <div role="status" className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${BANNER_CLASSES[detail.banner.tone]}`}>
        {detail.banner.text}
        {detail.banner.clock === null ? null : <span className="ml-2 font-figure">{detail.banner.clock}</span>}
        {detail.banner.note === null ? null : <span className="ml-2 font-medium">{detail.banner.note}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-2">Client</dt>
        <dd>
          {detail.businessId === null ? (
            "No business selected"
          ) : (
            <Link href={`/clients/${detail.businessId}`} className="font-semibold hover:underline">
              {detail.businessName ?? "Open the client"}
            </Link>
          )}
        </dd>
        <dt className="text-ink-2">Requester</dt>
        <dd>{detail.requester === null ? "Account unavailable" : [detail.requester.name, detail.requester.contact].filter((part) => part !== null).join(", ")}</dd>
        <dt className="text-ink-2">Reference</dt>
        <dd className="font-figure">{detail.displayRef}</dd>
      </dl>
      <section aria-label="Conversation" className="grid gap-3">
        <p className="text-xs text-ink-2">Conversation, oldest first. The newest message is next to the reply box.</p>
        <ol className="grid gap-3">
          {detail.messages.map((message) => (
            <li key={message.id} className={`rounded-[10px] px-3 py-2.5 ${message.internal ? "border-l-2 border-rattan bg-rattan-soft" : message.staff ? "bg-sunken" : "border border-line"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <h3 className="font-semibold">{message.who}</h3>
                <span className="font-figure text-xs text-ink-2">
                  <LocalDateTime iso={message.createdAtIso} variant="timestamp" />
                </span>
                {message.internal ? <span className="text-xs font-semibold text-rattan-ink">Internal note, staff only</span> : null}
                {message.tag === null ? null : <span className="text-xs text-ink-2">{message.tag}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
              {message.details.length === 0 ? null : (
                <dl className="mt-3 grid gap-2 text-sm">
                  {message.details.map((row) => (
                    <div key={row.label}>
                      <dt className="text-xs text-ink-2">{row.label}</dt>
                      <dd className="whitespace-pre-wrap break-words">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {message.attachments.length === 0 ? null : (
                <ul aria-label="Screenshots" className="mt-3 grid gap-1">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={`/support-attachments/${attachment.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">
                        {attachment.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>
      <div>
        <label htmlFor={`reply-${detail.id}`} className="sr-only">
          Reply to {requester}
        </label>
        <textarea
          id={`reply-${detail.id}`}
          value={composer.body}
          onChange={(event) => composer.setBody(event.target.value)}
          rows={5}
          maxLength={5000}
          disabled={composer.busy}
          placeholder={`Write a reply to ${requester}`}
          aria-describedby={`reply-hint-${detail.id}`}
          className={fieldClasses}
        />
        <p id={`reply-hint-${detail.id}`} className="mt-1 text-xs text-ink-2">
          A reply is emailed to the requester straight away. An internal note is only for staff.
        </p>
      </div>
      {children}
    </>
  );
}
