import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { ticketStatusWord } from "@brandbasket/shared/lib/change-requests";
import { BookCallButton } from "@/components/calls/book-call-button";
import { SupportReadReceipt } from "@/components/panel/support/support-read-receipt";
import { dayMonth } from "@/lib/call-dates";
import type { BookCallOptions } from "@/lib/calls/form";
import { KIND_LABELS } from "@/lib/requests/form";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import { dayIn, nextStep, stepperRows } from "@/lib/requests/status";
import type { NoticeLine } from "@/lib/requests/notices";
import type { RequestDetail as RequestDetailData } from "@/lib/server/requests";
import { NextStepBox } from "./next-step-box";
import { ReplyForm } from "./reply-form";
import { Stepper } from "./stepper";
import { Thread } from "./thread";

interface RequestDetailProps {
  readonly detail: RequestDetailData;
  readonly now: Date;
  /** A fresh key for the reply box. */
  readonly submissionKey: string;
  /** What just happened, if anything: a refused move or a payment coming back. */
  readonly notice: NoticeLine | null;
  /** What Book a call needs, or null when calls are not offered. */
  readonly calls?: BookCallOptions | null;
}

/** The open request: where it is, what happens next, the conversation, and the reply box. */
export function RequestDetail({ detail, now, submissionKey, notice, calls = null }: RequestDetailProps): ReactElement {
  const { ticket, change, events } = detail;
  const rows = change === null ? null : stepperRows(change, events);
  const step = change === null ? null : nextStep(change, events, dayIn(now), now);
  const last = detail.messages.at(-1);
  const kind = change === null ? "Question" : `${KIND_LABELS[change.kind]}${change.page === null ? "" : `, ${change.page}`}`;
  return (
    <section aria-labelledby="request-title" className="grid content-start">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 id="request-title" className="break-words font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {ticket.subject}
          </h2>
          <p className="mt-1 text-xs text-ink-2">
            {kind} · you asked on <span className="font-figure tabular-nums">{dayMonth(ticket.createdAt)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {calls === null || ticket.status === "closed" ? null : (
            <BookCallButton {...calls} look="link" label="Talk about it on a call" defaultReason={change?.kind ?? "other"} defaultNote={`About my request: ${ticket.subject}`} />
          )}
          {change === null ? <span className="rounded-md bg-sunken px-2 py-0.5 text-xs font-semibold text-ink">{ticketStatusWord(ticket.status)}</span> : null}
        </div>
      </header>
      {notice === null ? null : (
        <p role={notice.ok ? "status" : "alert"} className={cn("mx-5 mt-4 text-[0.8125rem] font-semibold", notice.ok ? "text-sage-deep" : "text-error")}>
          {notice.text}
        </p>
      )}
      {rows === null ? null : <Stepper rows={rows} />}
      {step === null || change === null ? null : <NextStepBox step={step} requestId={change.id} ticketId={ticket.id} />}
      <div className="mt-4">
        <Thread messages={detail.messages} attachments={detail.attachments} />
      </div>
      {last === undefined ? null : <SupportReadReceipt ticketId={ticket.id} messageId={last.id} />}
      {ticket.status === "closed" ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-2">
          This conversation is closed.{" "}
          <Link href={ASK_FOR_A_CHANGE_PATH} className="font-semibold text-ink underline underline-offset-[3px]">
            Ask for a change
          </Link>{" "}
          to start a new one.
        </p>
      ) : (
        <ReplyForm ticketId={ticket.id} submissionKey={submissionKey} sendLabel={change?.state === "preview" ? "Ask for a fix" : "Send"} />
      )}
    </section>
  );
}
