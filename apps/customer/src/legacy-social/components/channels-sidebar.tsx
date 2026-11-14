"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { buttonClasses } from "@/ui/button-styles";
import { cn } from "@brandbasket/shared/lib/cn";
import { SOFT_BUTTON } from "@/legacy-social/classes";
import { connectChannelAction } from "@/legacy-social/actions";
import { CHANNEL_PLATFORMS, PLATFORM_HINTS, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { ChannelLogo } from "./channel-logo";
import { useChannelFilter } from "./channel-filter";

export interface ChannelRow {
  readonly id: string;
  readonly platform: ChannelPlatform;
  readonly account: string;
  /** "Ends in 5 days" when the connection ends soon (or has), else null. */
  readonly ending: string | null;
  /** Posts are being held back from this account. */
  readonly paused: boolean;
}

interface ChannelsSidebarProps {
  readonly rows: readonly ChannelRow[];
  /** "Posts booked until 30 Nov.", or what to say when none are. */
  readonly bookedLine: string;
}

/** A button that sends the customer to a network's own Allow page. The business comes from the session on the server. */
export function ConnectButton({ platform, label, className, logo = false }: { readonly platform: ChannelPlatform; readonly label: string; readonly className?: string; readonly logo?: boolean }): ReactElement {
  return (
    <form action={connectChannelAction} className="min-w-0">
      <input type="hidden" name="channel" value={platform} />
      <button type="submit" className={cn(logo ? buttonClasses("secondary", "sm") : SOFT_BUTTON, "w-full", logo && "h-auto min-h-8 min-w-0 justify-start gap-2 whitespace-normal py-1.5 text-left leading-tight", className)}>
        {logo ? <ChannelLogo platform={platform} small /> : null}
        <span className="min-w-0">{label}</span>
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
      className="border-t border-line bg-surface p-4 pb-28 md:px-8 lg:sticky lg:top-topbar lg:h-channels-column lg:self-start lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:pt-4 lg:pb-8"
    >
      <h2 id="channels-title" className="px-1 type-section text-ink">
        Channels
      </h2>

      <ul className="mt-3 grid gap-1">
        {rows.length === 0 ? null : (
          <li>
            <button
              type="button"
              aria-pressed={!filtering}
              onClick={showAll}
              className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-neutral-wash", !filtering && "bg-neutral-wash")}
            >
              <span className="grid size-7 place-items-center rounded-md bg-ink text-[0.6875rem] font-bold text-on-primary" aria-hidden="true">
                All
              </span>
              <span className="min-w-0 type-body font-medium text-ink">All channels</span>
            </button>
          </li>
        )}
        {rows.map((row) => {
          const selected = filtering && shown.has(row.platform);
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => only(row.platform)}
                className={cn("grid w-full grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-neutral-wash", selected && "bg-neutral-wash")}
              >
                <ChannelLogo platform={row.platform} medium />
                <span className={cn("min-w-0", filtering && !selected && "opacity-60")}>
                  <span title={row.account} className="block truncate type-body font-medium text-ink">
                    {row.account}
                    <span className="sr-only">, {PLATFORM_NAMES[row.platform]}</span>
                  </span>
                  {row.paused ? <span className="mt-0.5 block text-xs font-semibold text-warn">Paused</span> : null}
                </span>
              </button>
              {row.ending === null ? null : (
                <div className="mt-1 grid gap-2 pb-2 pl-[2.75rem] pr-1.5">
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
        <section aria-labelledby="add-channel-title" className="mt-3 grid gap-2">
          <h3 id="add-channel-title" className="type-meta font-medium">
            {rows.length === 0 ? "Connect your accounts" : "Add a channel"}
          </h3>
          {missing.map((platform) => (
            <div key={platform} className="grid gap-1">
              <ConnectButton platform={platform} label={`Connect ${platform === "google" ? "Google" : PLATFORM_NAMES[platform]}`} logo />
              <span className="type-meta">{PLATFORM_HINTS[platform]}</span>
            </div>
          ))}
        </section>
      )}

      <p className="mt-4 px-1 text-[0.84375rem] text-ink-2">{bookedLine}</p>
    </aside>
  );
}
