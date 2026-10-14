import { listRecentEmails, listSmsMessages } from "@firstfold/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { MailIcon } from "@firstfold/shared/ui/icons";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Outbox" };

const MAX_MESSAGES = 50;

export default async function OutboxPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const db = getStaffDb();
  const [messages, smsMessages] = await Promise.all([
    listRecentEmails(db, MAX_MESSAGES),
    listSmsMessages(db, MAX_MESSAGES),
  ]);

  return (
    <>
      <PageHeader
        title="Outbox"
        meta="Every email the platform writes is recorded here. Emails to customers are sent separately, and the copy kept here leaves out any sign-in link."
      />

      {messages.length === 0 ? (
        <EmptyLine>Nothing written yet.</EmptyLine>
      ) : (
        <div className="mt-4">
          <HairlineList label="Messages">
            {messages.map((message) => (
              <HairlineRow
                key={message.id}
                href={`/outbox/${message.id}`}
                lead={
                  <span className="grid size-10 place-items-center rounded-full bg-paper-deep text-accent">
                    <MailIcon className="size-5" />
                  </span>
                }
                title={message.subject}
                sub={message.toAddress}
                trail={<LocalDateTime iso={message.createdAt.toISOString()} variant="timestamp" />}
              />
            ))}
          </HairlineList>
        </div>
      )}

      <h2 className="mt-16 font-serif text-[1.375rem] leading-tight">Text messages</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Not sent anywhere yet, OTP codes included. This is the only place a code is visible locally.
      </p>

      {smsMessages.length === 0 ? (
        <EmptyLine>No text messages yet.</EmptyLine>
      ) : (
        <ul aria-label="Text messages" className="mt-6 border-t border-line">
          {smsMessages.map((message) => (
            <li
              key={message.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b border-line py-4 pl-1 pr-2"
            >
              <span className="min-w-0">
                <span className="block font-semibold tabular-nums">{message.toPhone}</span>
                <span className="mt-0.5 block break-words text-sm tabular-nums text-ink-soft">{message.body}</span>
              </span>
              <span className="text-right text-sm tabular-nums text-ink-soft">
                <LocalDateTime iso={message.createdAt.toISOString()} variant="timestamp" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
