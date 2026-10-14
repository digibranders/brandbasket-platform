"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { TickIcon } from "@firstfold/shared/ui/icons";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { Button } from "@firstfold/shared/ui/panel/button";
import { SupportCategoryBadge, SupportStatusBadge } from "@firstfold/shared/ui/panel/support-status-badge";
import { readMySupportTicketDetail, replyToSupportRequest, type MySupportTicketDetail } from "@/app/app-host/(support)/support/actions";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";
import { handleImagePaste } from "@/lib/support-paste";
import { FIELD_CLASSES } from "@/components/panel/form/panel-form";
import { SupportAttachments, type SupportAttachmentsHandle } from "./support-attachments";
import { formatRelativeTime } from "./support-format";

export function SupportConversationView({
  ticketId,
  onBack,
  onNavigate,
}: {
  readonly ticketId: string;
  readonly onBack: () => void;
  readonly onNavigate: (href: string) => void;
}): ReactElement {
  const [detail, setDetail] = useState<MySupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Reply form state
  const [replyBody, setReplyBody] = useState("");
  const [replyAttachmentIds, setReplyAttachmentIds] = useState<readonly string[]>([]);
  const [replyUploading, setReplyUploading] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  const attachmentsRef = useRef<SupportAttachmentsHandle>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void readMySupportTicketDetail(ticketId)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setError("This request could not be found or has expired.");
        } else {
          setDetail(data);
          setError(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Failed to load conversation. Please try again.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticketId, reloadKey]);

  // The one paste handler, on the form: a paste inside the text box bubbles up to it.
  const handlePaste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachmentsRef.current?.addFiles(files), "reply-screenshot");
  }, []);

  const handleSendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!replyBody.trim()) return;

    try {
      setReplyPending(true);
      setReplyError(null);
      const formData = new FormData();
      formData.set("ticketId", ticketId);
      formData.set("body", replyBody.trim());
      formData.set("submissionKey", submissionKey);
      replyAttachmentIds.forEach((id) => formData.append("attachmentIds", id));

      const result = await replyToSupportRequest(INITIAL_SUPPORT_STATE, formData);
      if (result.status === "error") {
        setReplyError(result.message ?? "Could not send reply. Please try again.");
      } else {
        setReplyBody("");
        setReplyAttachmentIds([]);
        setSubmissionKey(crypto.randomUUID());
        setReloadKey((prev) => prev + 1);
        setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch {
      setReplyError("An error occurred while sending your reply.");
    } finally {
      setReplyPending(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-ink-soft">Loading conversation…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="py-8 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink cursor-pointer"
        >
          <span>← Back to requests</span>
        </button>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-800">
          {error ?? "Request not found."}
        </div>
      </div>
    );
  }

  const { ticket, messages } = detail;
  const isClosed = ticket.status === "closed";

  return (
    <div className="space-y-6">
      {/* Top action navigation */}
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors cursor-pointer"
        >
          <span>← Back to requests</span>
        </button>
        <Link
          href={`/support/${ticket.id}`}
          onClick={(event) => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onNavigate(`/support/${ticket.id}`);
            }
          }}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <span>Open full page</span>
          <span aria-hidden="true">↗</span>
        </Link>
      </div>

      {/* Ticket Header Card */}
      <div className="rounded-xl border border-line bg-paper-deep/40 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SupportCategoryBadge category={ticket.category} />
            <SupportStatusBadge status={ticket.status} size="sm" />
          </div>
          <span className="font-mono text-xs text-ink-muted">{ticket.reference}</span>
        </div>
        <h3 className="font-semibold text-lg text-ink leading-snug">{ticket.subject}</h3>
        <p className="text-xs text-ink-soft">
          Created {formatRelativeTime(ticket.createdAt)}
        </p>

        {/* Helpful status contextual banner */}
        {ticket.status === "waiting_on_you" ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent-pale/50 p-3 text-xs text-accent-deep">
            <span className="size-2 rounded-full bg-accent-deep mt-1 shrink-0 animate-pulse" />
            <p>Our team has sent a reply. Please reply below if you have any updates or answers.</p>
          </div>
        ) : ticket.status === "resolved" ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <TickIcon className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            <p>This request is marked as resolved. You can still reply below anytime to reopen it.</p>
          </div>
        ) : ticket.status === "closed" ? (
          <div className="mt-3 rounded-lg border border-line bg-paper-deep p-3 text-xs text-ink-soft">
            This conversation is closed and read-only. For new inquiries, please create a new request.
          </div>
        ) : null}
      </div>

      {/* Message Thread */}
      <div className="space-y-4">
        {messages.map((message) => {
          const isStaff = message.authorRole === "staff";
          return (
            <div
              key={message.id}
              className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                isStaff
                  ? "border-accent/30 bg-accent-pale/20"
                  : "border-line bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-ink">
                    {message.author}
                  </span>
                  {isStaff ? (
                    <span className="rounded-full bg-accent-pale px-2 py-0.5 text-[10px] font-semibold text-accent-deep">
                      Staff
                    </span>
                  ) : null}
                </div>
                <time className="text-[11px] text-ink-muted">
                  {formatRelativeTime(message.at)}
                </time>
              </div>

              <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
                {message.body}
              </div>

              {/* Technical context details if present */}
              {message.details.length > 0 ? (
                <details className="mt-3 rounded-lg border border-line/70 bg-paper-deep/60 p-3 text-xs">
                  <summary className="font-medium text-ink-soft cursor-pointer hover:text-ink">
                    Technical details
                  </summary>
                  <dl className="mt-2 space-y-1.5 pt-2 border-t border-line/40">
                    {message.details.map((detail) => (
                      <div key={detail.label} className="grid grid-cols-3 gap-2">
                        <dt className="text-ink-muted">{detail.label}:</dt>
                        <dd className="col-span-2 font-mono text-ink break-words">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}

              {/* Attachments */}
              {message.attachments.length > 0 ? (
                <div className="mt-3 pt-2 border-t border-line/40">
                  <p className="text-[11px] font-medium text-ink-muted mb-2">Attachments:</p>
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/support-attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-ink hover:border-accent hover:text-accent-deep transition-colors cursor-pointer"
                      >
                        <span className="truncate max-w-[200px]">{att.filename}</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={threadEndRef} />
      </div>

      {/* Reply Section */}
      {!isClosed ? (
        <form onSubmit={handleSendReply} onPaste={handlePaste} className="pt-2 border-t border-line space-y-4">
          <div>
            <label htmlFor="conversation-reply-body" className="block text-xs font-semibold text-ink mb-1.5">
              Reply to conversation
              <RequiredMark />
            </label>
            <textarea
              id="conversation-reply-body"
              rows={3}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your message here… (paste screenshots directly)"
              disabled={replyPending || replyUploading}
              required
              maxLength={5000}
              className={`${FIELD_CLASSES} text-sm`}
            />
          </div>

          {/* Keyed by the submission key, so a sent reply clears the old previews and the 3 of 3 counter. */}
          <SupportAttachments
            key={submissionKey}
            ref={attachmentsRef}
            onChange={setReplyAttachmentIds}
            onBusy={setReplyUploading}
          />

          {replyError ? (
            <p role="alert" className="text-xs text-rose-600 font-medium">
              {replyError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={replyPending || replyUploading || !replyBody.trim()}
              className="cursor-pointer"
            >
              {replyPending ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
