import type { SupportAttachment, SupportMessage } from "@brandbasket/db";
import { formatDateTime } from "@/lib/format";
import { Avatar, Icon } from "@/ui";
import { cx } from "@/ui/cx";

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

export interface ThreadProps {
  /** The public messages, oldest first (getSupportTicket returns no internal notes). */
  readonly messages: readonly SupportMessage[];
  readonly attachments: readonly SupportAttachment[];
  readonly customerName: string;
}

/** The conversation: the customer's messages marked with their own name, the team's with the team's. */
export function Thread({ messages, attachments, customerName }: ThreadProps) {
  return (
    <ol aria-label="Conversation" className="m-0 flex list-none flex-col gap-4 p-0">
      {messages.map((message) => {
        const mine = message.authorRole === "customer";
        const files = attachments.filter((file) => file.messageId === message.id);
        const details = Object.entries(message.details ?? {}).filter(([key, value]) => Object.hasOwn(DETAIL_LABELS, key) && value !== "");
        return (
          <li key={message.id} className="flex gap-3">
            <Avatar name={mine ? customerName : TEAM_NAME} size="sm" />
            <div className={cx("min-w-0 flex-1 rounded-control px-3 py-2.5", mine ? "bg-accent-wash" : "bg-surface-subtle")}>
              <p className="type-meta">
                <span className="type-sub text-ink">{mine ? "You" : TEAM_NAME}</span> {formatDateTime(message.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words type-body">{message.body}</p>
              {details.length === 0 ? null : (
                <dl className="mt-2 flex flex-col gap-0.5 type-meta">
                  {details.map(([key, value]) => (
                    <div key={key}>
                      <dt className="inline">{DETAIL_LABELS[key]}: </dt>
                      <dd className="inline break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {files.length === 0 ? null : (
                <ul aria-label="Screenshots" className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 type-meta">
                  {files.map((file, index) => (
                    <li key={file.id}>
                      <a href={`/support-attachments/${file.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                        <Icon name="Paperclip" size="sm" />
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
