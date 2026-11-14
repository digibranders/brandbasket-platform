"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { CHANNEL_PARAM, channelParamOf, withChannel } from "@/legacy-social/lib/social/channel-param";

export interface SocialTabsProps {
  readonly current: "calendar" | "posts" | "analytics";
  /** True once an Instagram, Facebook or Google account is connected: only then are there numbers to show. */
  readonly hasNumbers: boolean;
  /** True when an account is connected but none of them has numbers (LinkedIn only): the hint then says so instead of asking for a connection. */
  readonly onlyWithoutNumbers?: boolean;
  /** True once posts have been written from the website: only then is there anything to look over. */
  readonly hasPosts?: boolean;
  /** How many things wait for the customer on the Posts tab (the channel numbers added up); none when 0 or not known. */
  readonly waiting?: number;
}

const TAB = "-mb-px no-underline border-b-2 px-3.5 py-2 text-[0.875rem] font-semibold";
const tab = (on: boolean): string => cn(TAB, on ? "border-rattan-text text-ink" : "border-transparent text-ink-2");

/** Calendar, Posts (the written posts to look over) and Analytics, one line under the page title, so the header keeps only its buttons. Analytics is greyed, with the reason, until an account is connected. */
export function SocialTabs({ current, hasNumbers, onlyWithoutNumbers = false, hasPosts = false, waiting = 0 }: SocialTabsProps): ReactElement {
  // The channel she is looking at goes with her to the next tab.
  const channel = channelParamOf(useSearchParams()?.get(CHANNEL_PARAM));
  return (
    <nav aria-label="Content calendar" className="flex flex-wrap items-center gap-1 border-b border-line">
      <Link href={withChannel("/social", channel)} aria-current={current === "calendar" ? "page" : undefined} className={tab(current === "calendar")}>
        Calendar
      </Link>
      {hasPosts ? (
        <Link href={withChannel("/social/review", channel)} aria-current={current === "posts" ? "page" : undefined} className={tab(current === "posts")}>
          Posts
          {waiting > 0 ? (
            <span className="ml-1.5 rounded-full bg-warn-wash px-1.5 text-[0.6875rem] font-bold leading-5 text-warn" title={`${waiting} waiting for you on Posts`}>
              <span className="sr-only">, {waiting} waiting for you</span>
              <span aria-hidden="true">{waiting}</span>
            </span>
          ) : null}
        </Link>
      ) : null}
      {hasNumbers ? (
        <Link href={withChannel("/social/analytics", channel)} aria-current={current === "analytics" ? "page" : undefined} className={tab(current === "analytics")}>
          Analytics
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(TAB, "border-transparent text-ink-3 opacity-70")}>
          Analytics
          <span className="ml-2 text-[0.6875rem] font-normal">{onlyWithoutNumbers ? "LinkedIn has no numbers yet" : "Connect an account first"}</span>
        </span>
      )}
    </nav>
  );
}
