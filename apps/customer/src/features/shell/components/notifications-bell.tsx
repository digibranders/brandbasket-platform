"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PanelError } from "@/components";
import { formatRelative } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { Icon, IconButton, Popover } from "@/ui";
import { cx } from "@/ui/cx";
import { markNotificationsSeenAction } from "../actions";
import { bellAfterOpening, bellHasUnseenWork, type BellView } from "../rules";

/**
 * The bell in the top bar: what waits on the customer and the work we did, newest first. A dot shows while something is
 * new; opening it marks the work as read (notification_reads.seen_at), while waiting items stay until they are dealt with.
 */
export function NotificationsBell({ notifications }: { readonly notifications: Loaded<BellView> }) {
  const [open, setOpen] = useState(false);
  // When this browser marked the bell read; the server's next render carries the same fact in seen_at.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  const [, startTransition] = useTransition();
  const loaded = notifications.ok ? notifications.data : null;
  const view = loaded === null || openedAt === null ? loaded : bellAfterOpening(loaded, openedAt);
  const unread = view?.unread ?? 0;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || view === null || !bellHasUnseenWork(view)) return;
    const at = new Date();
    startTransition(async () => {
      // A failed write was reported by the action; the lines simply stay new until the bell is opened again.
      const result = await markNotificationsSeenAction();
      if (result.ok) setOpenedAt(at);
    });
  };

  return (
    <span className="relative inline-flex">
      <Popover
        open={open}
        onOpenChange={onOpenChange}
        align="end"
        title="Notifications"
        trigger={<IconButton icon="Bell" label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"} tooltip={false} />}
        className="w-88"
      >
        {!notifications.ok ? (
          <PanelError failure={notifications.error} what="your notifications" />
        ) : view === null || view.items.length === 0 ? (
          <p className="px-2.5 py-3 type-body text-ink-3">Nothing needs you right now.</p>
        ) : (
          <ul className="m-0 flex max-h-96 list-none flex-col overflow-y-auto p-0">
            {view.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 rounded-badge px-2.5 py-2 text-ink no-underline hover:bg-surface-hover"
                >
                  <Icon name={item.icon} size="sm" className={cx("mt-0.5", item.needsYou ? "text-warn-text" : "text-ink-3")} />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block type-table", item.unread && "font-medium")}>
                      {item.title}
                      {item.unread ? <span className="sr-only">, new</span> : null}
                    </span>
                    {item.at === null ? null : <span className="block type-meta">{formatRelative(item.at)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      {unread > 0 ? <span aria-hidden className="pointer-events-none absolute top-1 right-1 size-2 rounded-full border border-surface bg-primary" /> : null}
    </span>
  );
}
