import { findEmail } from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonPrimary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { canResendEmail, emailRow } from "@/lib/deliveries-view";
import { resendNotice } from "@/lib/deliveries-notices";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendEmailAction } from "../../deliveries/actions";

export const metadata: Metadata = { title: "Email" };

export default async function OutboxMessagePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly emailId: string }>;
  readonly searchParams: Promise<{ readonly resent?: string }>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { emailId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "outbox.view", targetType: "email", targetId: emailId });
  const message = await findEmail(getStaffDb(), emailId);
  if (message === null) notFound();
  const row = emailRow(message);
  const notice = resendNotice(await searchParams);

  return (
    <>
      <PageHeader
        back={{ href: "/deliveries?direction=out", label: "Deliveries" }}
        title={message.subject}
        meta={
          <>
            To {message.toAddress} · {row.event} · <LocalDateTime iso={message.createdAt.toISOString()} variant="timestamp" />
          </>
        }
      />
      {notice === null ? null : (
        <Notice tone={notice.tone} className="mt-4">
          {notice.text}
        </Notice>
      )}

      <div className="mt-8">
        <Section title="Delivery">
          <FactList
            items={[
              { label: "Result", value: <StatusPill tone={row.outcome === "failed" ? "problem" : row.outcome === "ok" ? "done" : "todo"}>{row.resultLabel}</StatusPill> },
              { label: "Reason", value: message.error ?? "None" },
              { label: "Tries", value: message.attempts },
              { label: "Last tried", value: <LocalDateTime iso={message.lastAttemptAt.toISOString()} variant="timestamp" /> },
              { label: "Brevo id", value: message.providerMessageId ?? "None" },
              { label: "Copy kept", value: message.bodyRedacted ? "Redacted: the sign-in link or customer text is left out" : "Whole" },
            ]}
          />
          {canResendEmail(message) ? (
            <form action={resendEmailAction} className="mt-6">
              <input type="hidden" name="deliveryId" value={message.id} />
              <input type="hidden" name="from" value="detail" />
              <button type="submit" className={buttonPrimary}>
                Resend
              </button>
            </form>
          ) : null}
        </Section>
        <Section title="As the customer sees it">
          {/* Sandboxed: the body is rendered email markup, never trusted as part of this page. */}
          <iframe title="HTML version" sandbox="" srcDoc={message.bodyHtml} className="h-[32rem] w-full rounded-lift bg-white shadow-lift" />
        </Section>
        <Section title="Plain text">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lift bg-sunken p-6 text-sm leading-relaxed">{message.bodyText}</pre>
        </Section>
      </div>
    </>
  );
}
