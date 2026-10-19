"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { readSupportUnreadCount } from "@/app/app-host/(support)/support/actions";
import { SupportRequestForm } from "./support-form";
import { SupportRequestList } from "./support-request-list";
import { SupportConversationView } from "./support-conversation-view";

export default function SupportDialog({
  initialCategory,
  canCreate,
  onClose,
}: {
  readonly initialCategory: "support" | null;
  readonly canCreate: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [view, setView] = useState<"new" | "requests" | "detail">(canCreate ? "new" : "requests");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [destination, setDestination] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    void readSupportUnreadCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
  }, [view]);

  const requestClose = useCallback((): void => {
    if (busy) return;
    if (discard) {
      setDiscard(false);
      setDestination(null);
      return;
    }
    if (dirty) setDiscard(true);
    else onClose();
  }, [busy, discard, dirty, onClose]);

  const onSent = useCallback(() => {
    void readSupportUnreadCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
  }, []);

  const navigate = useCallback(
    (href: string): void => {
      if (busy) return;
      if (dirty) {
        setDestination(href);
        setDiscard(true);
        return;
      }
      onClose();
      router.push(href);
    },
    [busy, dirty, onClose, router],
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1rem),42rem)] overflow-y-auto rounded-card bg-card p-0 text-ink shadow-lg backdrop:bg-ink/60 sm:w-[min(calc(100vw-2rem),42rem)]"
    >
      <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id={title} className="panel-title">
            {discard
              ? "Discard draft?"
              : view === "detail"
                ? "Request details"
                : "Feedback and support"}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (discard) {
                setDiscard(false);
                setDestination(null);
              } else {
                requestClose();
              }
            }}
            disabled={busy}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-paper-deep hover:text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={discard ? "Keep writing" : "Close"}
            title={discard ? "Keep writing" : "Close"}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>

        {discard ? (
          <div className="space-y-6 pt-1" role="alert">
            <p className="text-sm text-ink-soft leading-relaxed">
              Your draft has not been sent. If you discard now, your message and any attached screenshots will be lost.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDiscard(false);
                  setDestination(null);
                }}
              >
                Keep writing
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border-accent/40 text-accent-deep hover:bg-accent-pale/50 hover:border-accent"
                onClick={() => {
                  setDirty(false);
                  setDiscard(false);
                  setDestination(null);
                  onClose();
                  if (destination !== null) router.push(destination);
                }}
              >
                Discard draft
              </Button>
            </div>
          </div>
        ) : null}

        <div hidden={discard}>
          {view !== "detail" ? (
            <nav aria-label="Support navigation" className="mb-6 flex items-center gap-6 border-b border-line text-sm">
              {canCreate ? (
                <button
                  type="button"
                  disabled={busy}
                  role="tab"
                  aria-selected={view === "new"}
                  className={`-mb-px inline-flex items-center border-b-2 pb-2.5 pt-1 text-sm transition-colors duration-200 ease-calm cursor-pointer ${
                    view === "new"
                      ? "border-accent font-semibold text-ink"
                      : "border-transparent font-medium text-ink-soft hover:text-ink"
                  }`}
                  onClick={() => setView("new")}
                >
                  New request
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                role="tab"
                aria-selected={view === "requests"}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm transition-colors duration-200 ease-calm cursor-pointer ${
                  view === "requests"
                    ? "border-accent font-semibold text-ink"
                    : "border-transparent font-medium text-ink-soft hover:text-ink"
                }`}
                onClick={() => setView("requests")}
              >
                <span>My requests</span>
                {unreadCount > 0 ? (
                  <span className="rounded-full bg-accent-pale px-1.5 py-0.5 text-xs font-semibold text-accent-deep">
                    {unreadCount}
                  </span>
                ) : null}
              </button>
            </nav>
          ) : null}

          {!canCreate && view !== "detail" ? (
            <p className="mb-5 text-sm text-ink-soft">
              New requests are temporarily unavailable. You can still view and reply to existing requests.
            </p>
          ) : null}

          {view === "new" && canCreate ? (
            <SupportRequestForm
              key={generation}
              initialCategory={initialCategory}
              onDirty={setDirty}
              onBusy={setBusy}
              onSent={onSent}
              onNavigate={navigate}
              onViewTicket={(ticketId) => {
                setSelectedTicketId(ticketId);
                setView("detail");
              }}
              onViewAllRequests={() => setView("requests")}
              onSendAnother={() => {
                setGeneration((value) => value + 1);
              }}
            />
          ) : null}

          {view === "requests" ? (
            <SupportRequestList
              onSelectTicket={(ticketId) => {
                setSelectedTicketId(ticketId);
                setView("detail");
              }}
              onCreateNew={canCreate ? () => setView("new") : undefined}
              onNavigate={navigate}
            />
          ) : null}

          {view === "detail" && selectedTicketId !== null ? (
            <SupportConversationView
              ticketId={selectedTicketId}
              onBack={() => {
                setView("requests");
                setSelectedTicketId(null);
              }}
              onNavigate={navigate}
            />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
