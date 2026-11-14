"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { isReady, loadSeen, markSeen, type SeenChannels } from "@/legacy-social/lib/social/channel-activity";
import { ChannelLogo, ChannelRing } from "./channel-logo";

export interface ChannelWork {
  /** The browser's record of what was looked at is kept under this brand. */
  readonly brandId: string;
  /** Something is being written or drawn for the channel right now. */
  readonly working: boolean;
  /** When the newest finished work for the channel ended (ISO 8601), if any. */
  readonly doneAt?: string;
}

/**
 * A channel's logo and name for the channels column of the Calendar and Analytics pages, with what the Posts page shows too: the line that runs
 * around the logo while posts are being written for it, and the logo zooming and the name green once they are ready until the customer looks.
 * It gives the logo and the name as two parts of the row, so the row keeps its own layout; pressing anywhere on them counts as looking.
 */
export function ChannelLabel({ platform, account, todo, work, dim = false, children }: { readonly platform: ChannelPlatform; readonly account: string; readonly todo?: number; readonly work: ChannelWork; readonly dim?: boolean; readonly children?: ReactNode }): ReactElement {
  const [seen, setSeen] = useState<SeenChannels | null>(null);
  useEffect(() => {
    setSeen(loadSeen(work.brandId, new Date(), window.localStorage));
  }, [work.brandId]);
  const ready = !work.working && isReady({ working: new Set(), doneAt: work.doneAt === undefined ? {} : { [platform]: work.doneAt } }, seen, platform);
  const look = (): void => {
    if (ready) setSeen((current) => (current === null ? current : markSeen(work.brandId, current, platform, new Date(), window.localStorage)));
  };
  return (
    <>
      <span onPointerDown={look} className="relative grid size-7 shrink-0 place-items-center">
        {work.working ? <ChannelRing platform={platform} /> : null}
        <span className={cn("relative grid place-items-center", ready && "animate-channel-zoom")}>
          <ChannelLogo platform={platform} medium />
        </span>
      </span>
      <span onPointerDown={look} className={cn("min-w-0 flex-1", dim && "opacity-60")}>
        <span className="flex items-center gap-1.5">
          <span title={account} className={cn("min-w-0 truncate type-body font-medium", ready ? "font-semibold text-ok" : "text-ink")}>
            {account}
            <span className="sr-only">, {PLATFORM_NAMES[platform]}</span>
          </span>
          {todo === undefined || todo === 0 ? null : <span aria-label={`${todo} to do`} className="shrink-0 rounded-full bg-warn-wash px-1.5 text-xs font-semibold leading-5 text-warn">{todo}</span>}
        </span>
        {work.working ? <span className="mt-0.5 block truncate text-xs text-ink-2">Writing posts</span> : ready ? <span className="mt-0.5 block truncate text-xs font-semibold text-ok">Posts are ready</span> : null}
        {children}
      </span>
    </>
  );
}
