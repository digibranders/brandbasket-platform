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
 * The bell in the top bar: what waits on the customer and the work we did, newest first.
 * A gold dot shows while something is new. Opening it marks the work as read,
 * while waiting items stay until they are dealt with.
 */
export function NotificationsBell({ notifications }: { readonly notifications: Loaded<BellView> }) {
  const [open, setOpen] = useState(false);
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
        title={
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 ? (
              <span className="rounded-full bg-accent-wash px-2 py-0.5 font-mono text-xs font-semibold text-accent-text tabular-nums">
                {unread} new
              </span>
            ) : null}
          </div>
        }
        trigger={
          <IconButton
            icon="Bell"
            label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
            tooltip={false}
          />
        }
        className="w-96 shadow-hero"
      >
        {!notifications.ok ? (
          <PanelError failure={notifications.error} what="your notifications" />
        ) : view === null || view.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <svg className="h-6 w-6 text-pos-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 font-sans text-sm font-semibold text-ink">Nothing needs you right now.</p>
            <span className="mt-1 font-sans text-xs text-ink-3">
              Previews, post pictures and quotes appear here and on your home page.
            </span>
          </div>
        ) : (
          <ul className="m-0 flex max-h-96 list-none flex-col divide-y divide-border overflow-y-auto p-0">
            {view.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 p-3 transition-colors hover:bg-surface-hover"
                >
                  <span
                    className={cx(
                      "flex h-10 w-10 flex-none items-center justify-center rounded-control",
                      item.needsYou ? "bg-accent-wash text-accent-text" : "bg-surface-hover text-ink-2",
                    )}
                  >
                    <Icon name={item.icon} size="sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={cx("block font-sans text-sm", item.unread ? "font-semibold text-ink" : "text-ink-2")}>
                      {item.title}
                      {item.unread ? <span className="sr-only">, new</span> : null}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      {item.needsYou ? (
                        <span className="font-sans text-xs font-medium text-accent-text">Needs your OK</span>
                      ) : null}
                      {item.at === null ? null : (
                        <span className="font-mono text-xs text-ink-3 tabular-nums">
                          {formatRelative(item.at)}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.needsYou ? (
                    <span className="inline-flex h-7 items-center justify-center rounded-control bg-ink px-2.5 font-sans text-xs font-semibold text-on-primary">
                      Review
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      {unread > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full border-2 border-surface bg-accent-gold"
        />
      ) : null}
    </span>
  );
}
