"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "@/lib/social/auto";

interface ChannelFilter {
  /** The networks whose posts the calendar shows. */
  readonly shown: ReadonlySet<ChannelPlatform>;
  /** Shows or hides one network's posts. The last one shown stays, so the calendar is never empty by accident. */
  readonly toggle: (platform: ChannelPlatform) => void;
}

const FilterContext = createContext<ChannelFilter | null>(null);

/** Shares which channels are switched on between the channels column and the calendar. */
export function ChannelFilterProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [shown, setShown] = useState<ReadonlySet<ChannelPlatform>>(() => new Set(CHANNEL_PLATFORMS));
  const toggle = useCallback((platform: ChannelPlatform): void => {
    setShown((current) => {
      const next = new Set(current);
      if (!next.has(platform)) next.add(platform);
      else if (next.size > 1) next.delete(platform);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ shown, toggle }), [shown, toggle]);
  return <FilterContext value={value}>{children}</FilterContext>;
}

export function useChannelFilter(): ChannelFilter {
  const value = useContext(FilterContext);
  if (value === null) throw new Error("useChannelFilter must be used inside ChannelFilterProvider");
  return value;
}
