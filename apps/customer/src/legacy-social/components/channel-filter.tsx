"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { CHANNEL_PARAM, channelParamOf, rememberChannel } from "@/legacy-social/lib/social/channel-param";

interface ChannelFilter {
  /** The networks whose posts the calendar shows: all of them, or only the one that was tapped. */
  readonly shown: ReadonlySet<ChannelPlatform>;
  /** Whether the calendar is limited to some of the networks. */
  readonly filtering: boolean;
  /** Shows only this network's posts; tapping the one that is already alone shows every network again. */
  readonly only: (platform: ChannelPlatform) => void;
  readonly showAll: () => void;
}

const FilterContext = createContext<ChannelFilter | null>(null);

/** Shares which network the calendar is limited to between the channels column and the calendar. */
export function ChannelFilterProvider({ children }: { readonly children: ReactNode }): ReactElement {
  // The channel she chose on another page is in the address, so this page opens on it.
  const chosen = channelParamOf(useSearchParams()?.get(CHANNEL_PARAM));
  const [shown, setShown] = useState<ReadonlySet<ChannelPlatform>>(() => new Set(chosen === null || chosen === "all" ? CHANNEL_PLATFORMS : [chosen]));
  const only = useCallback((platform: ChannelPlatform): void => {
    setShown((current) => (current.size === 1 && current.has(platform) ? new Set(CHANNEL_PLATFORMS) : new Set([platform])));
  }, []);
  const showAll = useCallback((): void => setShown(new Set(CHANNEL_PLATFORMS)), []);
  // A change she makes goes into the address, so the other tabs open on the same channel (nothing is written until she changes it).
  const first = useRef(shown);
  useEffect(() => {
    if (shown === first.current) return;
    const [one] = [...shown];
    rememberChannel(shown.size === 1 && one !== undefined ? one : "all");
  }, [shown]);
  const value = useMemo(() => ({ shown, filtering: shown.size < CHANNEL_PLATFORMS.length, only, showAll }), [shown, only, showAll]);
  return <FilterContext value={value}>{children}</FilterContext>;
}

export function useChannelFilter(): ChannelFilter {
  const value = useContext(FilterContext);
  if (value === null) throw new Error("useChannelFilter must be used inside ChannelFilterProvider");
  return value;
}
