import { randomUUID } from "node:crypto";
import { requestBrand } from "@/lib/server/request-brand";
import Link from "next/link";
import { getSupportTicket } from "@firstfold/db";
import { z } from "zod";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { TickIcon } from "@firstfold/shared/ui/icons";
import { SupportCategoryBadge, SupportStatusBadge } from "@firstfold/shared/ui/panel/support-status-badge";
import { SupportThread, type SupportThreadEntry } from "@firstfold/shared/ui/panel/support-thread";
import { getAppDb } from "@/lib/server/db";
import { requireSupportAccess } from "@/lib/server/support-access";
import { SupportReply } from "@/components/panel/support/support-reply";
import { SupportReadReceipt } from "@/components/panel/support/support-read-receipt";
import { formatRelativeTime } from "@/components/panel/support/support-format";

export default async function SupportRequest({
  params,
}: {
  readonly params: Promise<{ ticketId: string }>;
}): Promise<ReactElement> {
  const { user } = await requireSupportAccess();
  const brand = await requestBrand();
  const { ticketId } = await params;
  if (!z.uuid().safeParse(ticketId).success) notFound();

  const detail = await getSupportTicket(getAppDb(), user.id, ticketId);
  if (detail === null) notFound();

  const messages: SupportThreadEntry[] = detail.messages.map((message) => ({
    id: message.id,
    body: message.body,
    author: message.authorRole === "staff" ? `${brand.shortName} Support` : "You",
    internal: false,
    at: message.createdAt.toISOString(),
    details: Object.entries(message.details ?? {}).map(([label, value]) => ({ label, value })),
    attachments: detail.attachments
      .filter((file) => file.messageId === message.id)
      .map((file) => ({ id: file.id, filename: file.filename })),
  }));

  const last = detail.messages.at(-1);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors cursor-pointer"
        >
          <span>← Back to requests</span>
        </Link>
      </div>

      {/* Ticket Details Header Card */}
      <div className="rounded-2xl border border-line bg-card p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SupportCategoryBadge category={detail.ticket.category} />
            <SupportStatusBadge status={detail.ticket.status} />
          </div>
          <span className="font-mono text-xs text-ink-muted">{detail.ticket.displayRef}</span>
        </div>

        <h1 className="panel-title break-words">{detail.ticket.subject}</h1>

        <p className="text-xs text-ink-soft">
          Created {formatRelativeTime(detail.ticket.createdAt.toISOString())}
        </p>

        {/* Helpful status contextual banner */}
        {detail.ticket.status === "waiting_on_you" ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent-pale/50 p-3.5 text-xs text-accent-deep">
            <span className="size-2 rounded-full bg-accent-deep mt-1 shrink-0 animate-pulse" />
            <p>Our team has sent a reply. Please reply below if you have any questions or answers.</p>
          </div>
        ) : detail.ticket.status === "resolved" ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
            <TickIcon className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            <p>This request is marked as resolved. You can still reply below anytime to reopen it.</p>
          </div>
        ) : detail.ticket.status === "closed" ? (
          <div className="mt-3 rounded-xl border border-line bg-paper-deep p-3.5 text-xs text-ink-soft">
            This conversation is closed and read-only. For new inquiries, please create a new request.
          </div>
        ) : null}
      </div>

      {/* Conversation Thread */}
      <div className="border-t border-line pt-2">
        <SupportThread messages={messages} />
      </div>

      {last === undefined ? null : <SupportReadReceipt ticketId={ticketId} messageId={last.id} />}

      {detail.ticket.status === "closed" ? (
        <p className="mt-6 text-sm text-ink-soft">This conversation is closed. Open a new request to continue.</p>
      ) : (
        <SupportReply ticketId={ticketId} submissionKey={randomUUID()} />
      )}
    </div>
  );
}
