"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "@/legacy-social/lib/social/auto";

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
  const [shown, setShown] = useState<ReadonlySet<ChannelPlatform>>(() => new Set(CHANNEL_PLATFORMS));
  const only = useCallback((platform: ChannelPlatform): void => {
    setShown((current) => (current.size === 1 && current.has(platform) ? new Set(CHANNEL_PLATFORMS) : new Set([platform])));
  }, []);
  const showAll = useCallback((): void => setShown(new Set(CHANNEL_PLATFORMS)), []);
  const value = useMemo(() => ({ shown, filtering: shown.size < CHANNEL_PLATFORMS.length, only, showAll }), [shown, only, showAll]);
  return <FilterContext value={value}>{children}</FilterContext>;
}

export function useChannelFilter(): ChannelFilter {
  const value = useContext(FilterContext);
  if (value === null) throw new Error("useChannelFilter must be used inside ChannelFilterProvider");
  return value;
}
