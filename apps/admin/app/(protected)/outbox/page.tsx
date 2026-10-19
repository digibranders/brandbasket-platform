import { listRecentEmails } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { MailIcon } from "@brandbasket/shared/ui/icons";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Outbox" };

const MAX_MESSAGES = 50;

export default async function OutboxPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const messages = await listRecentEmails(getStaffDb(), MAX_MESSAGES);

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
    </>
  );
}
