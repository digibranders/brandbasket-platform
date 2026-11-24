"use client";

import { Menu } from "@base-ui/react/menu";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { dayLabel } from "@/legacy-social/lib/social/auto";

/** One day of the topic's week: whether it can be chosen, and when it cannot, why in a word ("Today", "Passed"). */
export interface DayChoice {
  readonly day: string;
  readonly why: string | null;
}

const TRIGGER = "inline-grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ok data-[popup-open]:bg-ok data-[popup-open]:text-on-primary";

/**
 * The calendar button on a topic's card and the small list of days it opens. The list is as small as the card it comes from: a narrow panel,
 * rows a little taller than their text, and the days that cannot be chosen greyed out with a word saying why. It opens over the page, so the
 * week's grid never cuts it off, and the arrow keys, Enter and Escape work.
 */
export function DayMenu({ choices, disabled = false, onMove }: { readonly choices: readonly DayChoice[]; readonly disabled?: boolean; readonly onMove: (day: string) => void }): ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger type="button" title="Change the day" aria-label="Change the day" disabled={disabled} className={TRIGGER}>
        <CalendarBlank size={13} weight="bold" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="min-w-36 rounded-lg border border-line bg-surface p-1 shadow-popover outline-none">
            <div className="px-2 pt-1 pb-1.5 text-[0.6875rem] font-semibold text-ink-3">Move to</div>
            {choices.map(({ day, why }) => (
              <Menu.Item
                key={day}
                disabled={why !== null}
                onClick={() => onMove(day)}
                className={cn("flex h-7 cursor-pointer items-center justify-between gap-3 rounded-md px-2 text-[0.8125rem] text-ink outline-none select-none data-[highlighted]:bg-sunken", why !== null && "cursor-not-allowed text-ink-3")}
              >
                {dayLabel(day)}
                {why === null ? null : <span className="text-[0.6875rem]">{why}</span>}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
