import type { SupportAttachment, SupportMessage } from "@brandbasket/db";
import { Paperclip } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { dayMonth, slotTime } from "@/lib/call-dates";

/** What the team is called to the customer. */
export const TEAM_NAME = "Brandbasket team";

/** The labels for the few details a ticket's first message can carry. */
const DETAIL_LABELS: Readonly<Record<string, string>> = {
  pageUrl: "Page",
  requestedChange: "Requested change",
  invoiceReference: "Invoice or payment reference",
  stepsToReproduce: "Steps to reproduce",
  expectedBehavior: "What you expected",
  actualBehavior: "What happened",
  browserDevice: "Browser",
  accountEmail: "Account email",
};

/** "27 Nov 18:02", in India. */
function sentAt(at: Date): string {
  return `${dayMonth(at)} ${slotTime(at.toISOString())}`;
}

interface ThreadProps {
  /** The public messages, oldest first (getSupportTicket returns no internal notes). */
  readonly messages: readonly SupportMessage[];
  readonly attachments: readonly SupportAttachment[];
}

/** The conversation: the customer's messages on the right in ink, the team's on the left with its mark. */
export function Thread({ messages, attachments }: ThreadProps): ReactElement {
  return (
    <ol aria-label="Conversation" className="grid content-start gap-3 bg-bg px-5 py-4">
      {messages.map((message) => {
        const mine = message.authorRole === "customer";
        const files = attachments.filter((file) => file.messageId === message.id);
        const details = Object.entries(message.details ?? {}).filter(([key, value]) => Object.hasOwn(DETAIL_LABELS, key) && value !== "");
        return (
          <li key={message.id} className={cn("grid max-w-[40rem] gap-2.5", mine ? "justify-self-end" : "grid-cols-[1.875rem_minmax(0,1fr)]")}>
            {mine ? null : (
              <span aria-hidden="true" className="grid size-[1.875rem] place-items-center rounded-lg bg-ink font-display text-[0.6875rem] font-bold text-rattan">
                BB
              </span>
            )}
            <div className={cn("grid gap-1.5 px-3 py-2.5 text-[0.84375rem] leading-relaxed", mine ? "rounded-[0.75rem_0.25rem_0.75rem_0.75rem] bg-ink text-white" : "rounded-[0.25rem_0.75rem_0.75rem_0.75rem] bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]")}>
              <small className={cn("text-xs", mine ? "text-white/70" : "text-ink-2")}>
                {mine ? "You" : TEAM_NAME}, <span className="font-figure tabular-nums">{sentAt(message.createdAt)}</span>
              </small>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              {details.length === 0 ? null : (
                <dl className="grid gap-1 text-xs">
                  {details.map(([key, value]) => (
                    <div key={key}>
                      <dt className={cn("inline", mine ? "text-white/70" : "text-ink-2")}>{DETAIL_LABELS[key]}: </dt>
                      <dd className="inline break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {files.length === 0 ? null : (
                <ul aria-label="Screenshots" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {files.map((file, index) => (
                    <li key={file.id}>
                      <a href={`/support-attachments/${file.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                        <Paperclip size={14} aria-hidden="true" />
                        Screenshot {index + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
