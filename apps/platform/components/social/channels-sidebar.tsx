"use client";

import { Lock, Warning } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { connectChannelAction } from "@/app/app-host/(protected)/social/actions";
import { CHANNEL_PLATFORMS, PLATFORM_HINTS, PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";
import { ChannelLogo } from "./channel-logo";
import { useChannelFilter } from "./channel-filter";

export interface ChannelRow {
  readonly id: string;
  readonly platform: ChannelPlatform;
  readonly account: string;
  /** "Ends in 5 days" when the connection ends soon (or has), else null. */
  readonly ending: string | null;
}

interface ChannelsSidebarProps {
  readonly rows: readonly ChannelRow[];
  /** "Posts booked until 30 Nov.", or what to say when none are. */
  readonly bookedLine: string;
}

/** A button that sends the customer to a network's own Allow page. The business comes from the session on the server. */
function ConnectButton({ platform, label, className, logo = false }: { readonly platform: ChannelPlatform; readonly label: string; readonly className?: string; readonly logo?: boolean }): ReactElement {
  return (
    <form action={connectChannelAction}>
      <input type="hidden" name="channel" value={platform} />
      <button type="submit" className={cn(SOFT_BUTTON, "w-full", logo && "justify-start gap-2.5 px-3", className)}>
        {logo ? <ChannelLogo platform={platform} small /> : null}
        {label}
      </button>
    </form>
  );
}

/**
 * The second sidebar of the Social media page: only the channels. Each connected account is a row that switches that
 * network's posts on or off in the calendar; a network with no account yet has a Connect button.
 */
export function ChannelsSidebar({ rows, bookedLine }: ChannelsSidebarProps): ReactElement {
  const { shown, filtering, only, showAll } = useChannelFilter();
  const missing = CHANNEL_PLATFORMS.filter((platform) => !rows.some((row) => row.platform === platform));
  return (
    <aside
      id="channels"
      aria-labelledby="channels-title"
      className="border-t border-line bg-surface p-4 pb-28 md:px-8 lg:sticky lg:top-0 lg:h-dvh lg:w-[13rem] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:py-8 lg:pb-8"
    >
      <h2 id="channels-title" className="px-1 font-display text-[1.0625rem] font-semibold text-ink">
        Channels
      </h2>
      <p className="mt-1 px-1 text-[0.84375rem] leading-snug text-ink-2">Tap a channel to see only its posts.</p>

      {filtering ? (
        <button type="button" onClick={showAll} className="mt-2 px-1 text-[0.84375rem] font-semibold text-ink-2 underline">
          Show all channels
        </button>
      ) : null}

      <ul className="mt-3 grid gap-0.5">
        {rows.map((row) => {
          const selected = filtering && shown.has(row.platform);
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => only(row.platform)}
                className={cn("grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-sunken", selected && "bg-sunken")}
              >
                <ChannelLogo platform={row.platform} />
                <span className={cn("min-w-0", filtering && !selected && "opacity-60")}>
                  <span className="block break-words text-[0.84375rem] font-semibold leading-tight text-ink">
                    {row.account}
                    <span className="sr-only">, {PLATFORM_NAMES[row.platform]}</span>
                  </span>
                </span>
              </button>
              {row.ending === null ? null : (
                <div className="mt-1 grid gap-2 pb-2 pl-[3.75rem] pr-1.5">
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warn-wash px-2 py-0.5 text-xs font-semibold text-warn">
                    <Warning size={14} weight="fill" aria-hidden="true" />
                    {row.ending}
                  </span>
                  <ConnectButton platform={row.platform} label="Reconnect" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {missing.length === 0 ? null : (
        <section aria-labelledby="add-channel-title" className="mt-4 grid gap-2">
          <h3 id="add-channel-title" className="px-1 text-xs font-semibold text-ink-2">
            {rows.length === 0 ? "Connect your accounts" : "Add a channel"}
          </h3>
          {missing.map((platform) => (
            <div key={platform} className="grid gap-1">
              <ConnectButton platform={platform} label={`Connect ${PLATFORM_NAMES[platform]}`} logo />
              <span className="px-1 text-xs text-ink-3">{PLATFORM_HINTS[platform]}</span>
            </div>
          ))}
        </section>
      )}

      <p className="mt-4 px-1 text-[0.84375rem] text-ink-2">{bookedLine}</p>
      <p className="mt-2 flex gap-1.5 px-1 text-xs leading-snug text-ink-3">
        <Lock size={13} aria-hidden="true" className="mt-px shrink-0" />
        <span>You approve on each network&rsquo;s own page. We never see your password.</span>
      </p>
    </aside>
  );
}
