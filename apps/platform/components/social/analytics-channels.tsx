import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";
import { isAnalyticsChannel, type AnalyticsChannel } from "@/lib/social/analytics";
import { ChannelLogo } from "./channel-logo";

export interface AnalyticsChannelRow {
  readonly id: string;
  readonly platform: ChannelPlatform;
  readonly account: string;
  /** What the numbers for this account are doing, in a few words. */
  readonly status: string;
  /** The address that shows only this network, or null for one analytics is not offered for. */
  readonly href: string | null;
}

interface AnalyticsChannelsProps {
  readonly rows: readonly AnalyticsChannelRow[];
  readonly allHref: string;
  readonly selected: "all" | AnalyticsChannel;
}

/** The second sidebar of the Analytics page: the same channels column as the Social media page, so the two feel like one place. A row picks that network's numbers. */
export function AnalyticsChannels({ rows, allHref, selected }: AnalyticsChannelsProps): ReactElement {
  return (
    <aside
      id="channels"
      aria-labelledby="channels-title"
      className="border-t border-line bg-surface p-4 pb-28 md:px-8 lg:sticky lg:top-0 lg:h-dvh lg:w-[13rem] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:py-8 lg:pb-8"
    >
      <h2 id="channels-title" className="px-1 font-display text-[1.0625rem] font-semibold text-ink">
        Channels
      </h2>
      <p className="mt-1 px-1 text-[0.84375rem] leading-snug text-ink-2">Tap a channel to see only its numbers.</p>
      {selected === "all" ? null : (
        <Link href={allHref} className="mt-2 block px-1 text-[0.84375rem] font-semibold text-ink-2 underline">
          Show all channels
        </Link>
      )}
      <ul className="mt-3 grid gap-0.5">
        {rows.map((row) => {
          const on = row.href !== null && isAnalyticsChannel(row.platform) && selected === row.platform;
          const body = (
            <>
              <ChannelLogo platform={row.platform} medium />
              <span className="min-w-0">
                <span className="block break-words text-[0.84375rem] font-semibold leading-tight text-ink">
                  {row.account}
                  <span className="sr-only">, {PLATFORM_NAMES[row.platform]}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">{row.status}</span>
              </span>
            </>
          );
          const base = "grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left";
          return (
            <li key={row.id}>
              {row.href === null ? (
                <div className={cn(base, "opacity-60")}>{body}</div>
              ) : (
                <Link href={row.href} aria-current={on ? "true" : undefined} className={cn(base, "transition-colors hover:bg-sunken", on && "bg-sunken")}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length === 0 ? <p className="mt-3 px-1 text-[0.84375rem] text-ink-2">No accounts connected yet. Connect them on the Posts tab.</p> : null}
    </aside>
  );
}
