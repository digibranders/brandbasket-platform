"use client";

import { createContext, useContext } from "react";

export interface SupportLauncher {
  readonly open: (category: "support" | null, trigger: HTMLElement | null) => void;
  readonly unread: number;
}

/** Optional: other consumers of the shared frame retain their configured contact destination. */
export const SupportContext = createContext<SupportLauncher | null>(null);

export function useSupportLauncher(): SupportLauncher | null {
  return useContext(SupportContext);
}
