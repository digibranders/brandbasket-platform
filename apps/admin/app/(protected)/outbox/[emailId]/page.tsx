import { findEmail } from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { PageHeader } from "@/components/console/page-header";
import { Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

export const metadata: Metadata = { title: "Message" };

export default async function OutboxMessagePage({
  params,
}: {
  readonly params: Promise<{ readonly emailId: string }>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { emailId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "outbox.view", targetType: "email", targetId: emailId });
  const message = await findEmail(getStaffDb(), emailId);
  if (message === null) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/outbox", label: "Outbox" }}
        title={message.subject}
        meta={
          <>
            To {message.toAddress} · {message.template} ·{" "}
            <LocalDateTime iso={message.createdAt.toISOString()} variant="timestamp" />
          </>
        }
      />
      <p className="mt-6 max-w-2xl border-l-2 border-gold-deep py-1 pl-4 text-sm leading-relaxed text-ink-soft">
        Kept, not sent: email is local-only for now. Any setup link inside is live, so opening it works exactly as it
        would for the customer.
      </p>

      <div className="mt-10">
        <Section title="As the customer sees it">
          {/* Sandboxed: the body is rendered email markup, never trusted as part of this page. */}
          <iframe
            title="HTML version"
            sandbox=""
            srcDoc={message.bodyHtml}
            className="h-[32rem] w-full rounded-2xl bg-white shadow-[0_0_0_1px_var(--color-line)]"
          />
        </Section>
        <Section title="Plain text">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-paper-deep p-6 text-sm leading-relaxed">
            {message.bodyText}
          </pre>
        </Section>
      </div>
    </>
  );
}
