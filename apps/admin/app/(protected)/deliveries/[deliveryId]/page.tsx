import { findAlertDelivery, findEmail, findWebhookEvent, type StoredAlertDelivery, type StoredWebhookEvent } from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonPrimary } from "@/components/console/buttons";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { alertRow, SOURCE_LABELS, webhookRow } from "@/lib/deliveries-view";
import { resendNotice } from "@/lib/deliveries-notices";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendAlertAction } from "../actions";

export const metadata: Metadata = { title: "Delivery" };

function WebhookFacts({ event }: { readonly event: StoredWebhookEvent }): ReactElement {
  const row = webhookRow(event);
  return (
    <Section title="What came in">
      <FactList
        items={[
          { label: "Source", value: SOURCE_LABELS[event.source] },
          { label: "Event", value: <code className="font-figure text-sm">{event.eventType}</code> },
          { label: "Result", value: <StatusPill tone={row.outcome === "failed" ? "problem" : row.outcome === "ok" ? "done" : "todo"}>{row.resultLabel}</StatusPill> },
          { label: "Reason", value: event.error ?? "None" },
          { label: "Client", value: event.businessName ?? "Not linked" },
          { label: "Received", value: <LocalDateTime iso={event.receivedAt.toISOString()} variant="timestamp" /> },
          { label: "Body size", value: `${event.bodyBytes.toLocaleString("en-IN")} bytes` },
          { label: "Body fingerprint", value: <code className="font-figure text-sm">{event.bodySha256.slice(0, 16)}</code> },
          { label: "Reference", value: <span className="break-all">{event.id}</span> },
        ]}
      />
      <p className="mt-5 max-w-2xl text-sm text-ink-2">The body is never kept, only its fingerprint, so a repeat of the same delivery can be told apart.</p>
    </Section>
  );
}

function AlertFacts({ alert }: { readonly alert: StoredAlertDelivery }): ReactElement {
  const row = alertRow(alert);
  return (
    <Section title="What went out">
      <FactList
        items={[
          { label: "Channel", value: row.event },
          { label: "Title", value: alert.title },
          { label: "Result", value: <StatusPill tone={row.outcome === "failed" ? "problem" : "done"}>{row.resultLabel}</StatusPill> },
          { label: "Tries", value: alert.attempts },
          { label: "First tried", value: <LocalDateTime iso={alert.createdAt.toISOString()} variant="timestamp" /> },
          { label: "Last tried", value: <LocalDateTime iso={alert.lastAttemptAt.toISOString()} variant="timestamp" /> },
          { label: "Reference", value: <span className="break-all">{alert.id}</span> },
        ]}
      />
      {row.resend === null ? null : (
        <form action={resendAlertAction} className="mt-6">
          <input type="hidden" name="deliveryId" value={alert.id} />
          <input type="hidden" name="from" value="detail" />
          <button type="submit" className={buttonPrimary}>
            Resend
          </button>
        </form>
      )}
    </Section>
  );
}

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly deliveryId: string }>;
  readonly searchParams: Promise<{ readonly resent?: string }>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { deliveryId } = await params;
  if (!z.uuid().safeParse(deliveryId).success) notFound();
  await logStaffAccess({ staffUserId: user.id, action: "delivery.view", targetType: "delivery", targetId: deliveryId });
  const db = getStaffDb();
  const webhook = await findWebhookEvent(db, deliveryId);
  const alert = webhook === null ? await findAlertDelivery(db, deliveryId) : null;
  if (webhook === null && alert === null) {
    if ((await findEmail(db, deliveryId)) !== null) redirect(`/outbox/${deliveryId}`);
    notFound();
  }
  const notice = resendNotice(await searchParams);

  return (
    <>
      <PageHeader
        back={{ href: "/deliveries", label: "Deliveries" }}
        title={webhook !== null ? webhook.eventType : (alert?.title ?? "Delivery")}
        meta={webhook !== null ? `${SOURCE_LABELS[webhook.source]} webhook` : "Teams alert"}
      />
      {notice === null ? null : (
        <Notice tone={notice.tone} className="mt-4">
          {notice.text}
        </Notice>
      )}
      <div className="mt-8">{webhook !== null ? <WebhookFacts event={webhook} /> : alert !== null ? <AlertFacts alert={alert} /> : null}</div>
    </>
  );
}
