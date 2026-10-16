"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { formatTimestamp } from "@fynix/shared/lib/format";
import { openLeadConversationAction, type OpenedConversation } from "@/app/app-host/(protected)/oyechats/actions";
import { CONVERSATION_NOTICES, MESSAGE_AUTHOR_LABELS, messageCountLabel, type LeadTableRow } from "@/lib/chatbots-view";

type Loaded = { readonly leadId: string; readonly result: OpenedConversation | "failed" };

/**
 * The pop-up that shows what a visitor and the OyeChats assistant said. It asks the server for the conversation when it opens
 * (nothing is kept in the page), shows who said each message and when, and says plainly when it cannot be shown. Message text
 * is always rendered as text, never as markup.
 */
export function LeadConversationDialog({ row, onClose }: { readonly row: LeadTableRow; readonly onClose: () => void }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let current = true;
    openLeadConversationAction(row.id)
      .then((result) => {
        if (current) setLoaded({ leadId: row.id, result });
      })
      .catch(() => {
        if (current) setLoaded({ leadId: row.id, result: "failed" });
      });
    return () => {
      current = false;
    };
  }, [row.id]);

  const result = loaded?.leadId === row.id ? loaded.result : null;

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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1rem),40rem)] overflow-hidden rounded-card bg-card p-0 text-ink shadow-lg backdrop:bg-ink/60 sm:w-[min(calc(100vw-2rem),40rem)]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
          <div className="min-w-0">
            <h2 id={titleId} className="panel-section truncate">
              {row.title}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {[row.lines[0], row.company, row.messages === null ? null : messageCountLabel(row.messages)].filter((part) => part !== null && part !== undefined).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-paper-deep hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>

        <div className="min-h-40 overflow-y-auto p-5 sm:px-7" aria-live="polite" aria-busy={result === null}>
          {result === null ? (
            <p className="text-sm text-ink-soft">Loading the conversation.</p>
          ) : result === "failed" || result.status !== "ok" ? (
            <p role="status" className="rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
              {CONVERSATION_NOTICES[result === "failed" ? "unavailable" : result.status]}
            </p>
          ) : result.messages.length === 0 ? (
            <p className="text-sm text-ink-soft">{CONVERSATION_NOTICES.empty}</p>
          ) : (
            <ol aria-label="Messages" className="flex flex-col gap-4">
              {result.messages.map((message, index) => (
                <li key={`${message.at ?? "unknown"}-${index}`} className={cn("flex max-w-[85%] flex-col gap-1", message.author === "visitor" ? "self-start" : "self-end items-end")}>
                  <p className="text-xs text-ink-soft">
                    {MESSAGE_AUTHOR_LABELS[message.author]}
                    {message.at === null ? "" : ` · ${formatTimestamp(new Date(message.at))}`}
                  </p>
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words rounded-card px-4 py-2.5 text-sm",
                      message.author === "visitor" ? "bg-paper-deep text-ink" : message.author === "team" ? "bg-success/10 text-ink" : "bg-accent-pale text-ink",
                    )}
                  >
                    {message.text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </dialog>
  );
}
