"use client";

import { Bell } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { useDialogOpen } from "@brandbasket/shared/ui/v2/dialog-hooks";
import { markStaffNotificationReadAction } from "@/lib/server/staff-notification-actions";
import type { StaffBellView } from "@/lib/staff-bell";

interface StaffBellProps {
  readonly view: StaffBellView;
  /** The dark rail or the light phone bar. */
  readonly tone: "dark" | "light";
}

/**
 * The console's bell: the notices for the staff account, newest first, in a native dialog so Escape closes it. Opening a
 * line marks it read. The numbers refresh with the page (StaffBellRefresh), not here.
 */
export function StaffBell({ view, tone }: StaffBellProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<readonly string[]>([]);
  const dialog = useDialogOpen(open);
  const items = view.items.map((item) => (readIds.includes(item.id) ? { ...item, unread: false } : item));
  const unread = items.filter((item) => item.unread).length;

  async function onOpenItem(id: string, wasUnread: boolean): Promise<void> {
    setOpen(false);
    if (!wasUnread) return;
    setReadIds((previous) => [...previous, id]);
    if (!(await markStaffNotificationReadAction(id))) setReadIds((previous) => previous.filter((entry) => entry !== id));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        className={cn(
          "relative grid size-10 place-items-center rounded-full transition-colors duration-200",
          tone === "dark" ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-ink hover:bg-sunken",
        )}
      >
        <Bell size={22} aria-hidden="true" />
        {unread > 0 ? (
          <span aria-hidden="true" className="absolute right-1 top-1 min-w-4 rounded-full bg-rattan px-1 text-center font-figure text-[0.6875rem] font-semibold leading-4 text-ink tabular-nums">
            {unread}
          </span>
        ) : null}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label="Notifications"
        className="mx-auto mt-[12vh] w-[min(28rem,calc(100%-2rem))] overflow-hidden rounded-lift bg-surface p-0 text-ink shadow-lift backdrop:bg-ink/30"
      >
        <p className="border-b border-line px-4 py-3 font-display text-sm font-semibold">Notifications</p>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-2">Nothing new.</p>
        ) : (
          <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-0">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} onClick={() => void onOpenItem(item.id, item.unread)} className="block px-4 py-3 transition-colors duration-200 hover:bg-sunken focus-visible:bg-sunken">
                  <span className={cn("block text-sm", item.unread ? "font-semibold" : "text-ink-2")}>
                    {item.title}
                    {item.unread ? <span className="sr-only">, new</span> : null}
                  </span>
                  {item.body === null ? null : <span className="block text-xs text-ink-2">{item.body}</span>}
                  <span className="block font-figure text-xs text-ink-2 tabular-nums">{item.when}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}
