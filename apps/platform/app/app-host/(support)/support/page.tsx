import Link from "next/link";
import { listSupportTickets } from "@firstfold/db";
import type { ReactElement } from "react";
import { ArrowIcon, ChatIcon } from "@firstfold/shared/ui/icons";
import { SupportCategoryBadge, SupportStatusBadge } from "@firstfold/shared/ui/panel/support-status-badge";
import { getAppDb } from "@/lib/server/db";
import { requireSupportAccess } from "@/lib/server/support-access";
import { SupportButton } from "@/components/panel/support/support-button";
import { formatRelativeTime } from "@/components/panel/support/support-format";

export default async function MySupportRequests({
  searchParams,
}: {
  readonly searchParams: Promise<{ cursor?: string }>;
}): Promise<ReactElement> {
  const { user } = await requireSupportAccess();
  const { cursor } = await searchParams;
  const page = await listSupportTickets(getAppDb(), user.id, {
    cursor: cursor !== undefined && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : undefined,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="panel-title">My requests</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Track status updates, staff responses, and your conversations.
          </p>
        </div>
        <SupportButton />
      </div>

      {page.items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card py-16 px-6 text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-paper-deep text-ink-soft">
            <ChatIcon className="size-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">No requests yet</h3>
            <p className="mt-1 text-sm text-ink-soft max-w-sm mx-auto">
              Your feedback, bug reports, and support questions will appear here with live updates from our team.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {page.items.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/support/${ticket.id}`}
              className="group flex flex-col gap-2.5 rounded-xl border border-line bg-card p-5 transition-all duration-200 hover:border-accent/40 hover:bg-paper-deep/40 hover:shadow-xs cursor-pointer"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SupportCategoryBadge category={ticket.category} />
                  <SupportStatusBadge status={ticket.status} size="sm" />
                </div>
                <time className="text-xs text-ink-muted">
                  {formatRelativeTime(ticket.createdAt.toISOString())}
                </time>
              </div>

              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-base text-ink group-hover:text-accent-deep transition-colors line-clamp-2">
                  {ticket.subject}
                </h3>
                {ticket.unread ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-pale px-2.5 py-0.5 text-xs font-semibold text-accent-deep">
                    <span className="size-1.5 rounded-full bg-accent-deep animate-pulse" />
                    New reply
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between text-xs text-ink-soft pt-3 border-t border-line/60">
                <span className="font-mono text-ink-muted">{ticket.displayRef}</span>
                <span className="inline-flex items-center gap-1 font-medium text-ink-soft group-hover:text-ink transition-colors">
                  <span>View conversation</span>
                  <ArrowIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {page.nextCursor === null ? null : (
        <div className="pt-2">
          <Link
            href={`/support?cursor=${page.nextCursor}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2 text-xs font-medium text-ink hover:bg-paper-deep transition-colors cursor-pointer"
          >
            Older requests
          </Link>
        </div>
      )}
    </div>
  );
}
