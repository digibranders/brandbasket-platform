"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { SaveBar } from "@/components";

/** What a section form tells the host: whether it has unsaved changes, whether it is saving, and how to throw its changes away. */
export interface FormReport {
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly discard: () => void;
}

interface HostApi {
  readonly report: (id: string, report: FormReport) => void;
  readonly forget: (id: string) => void;
}

const HostContext = createContext<HostApi | null>(null);

interface Entry {
  readonly dirty: boolean;
  readonly pending: boolean;
  /** Order in which the form last became dirty: the newest one owns the bar. */
  readonly since: number;
}

/**
 * Holds the one SaveBar for every form section on the page. The bar is fixed to the bottom, so two bars would sit on top of
 * each other; the form edited last owns it, and when it is saved the next form with changes takes over.
 */
export function SaveBarHost({ children }: { readonly children: ReactNode }) {
  const [entries, setEntries] = useState<Readonly<Record<string, Entry>>>({});
  const discards = useRef(new Map<string, () => void>());
  const counter = useRef(0);

  const report = useCallback((id: string, next: FormReport) => {
    discards.current.set(id, next.discard);
    const stamp = (counter.current += 1);
    setEntries((previous) => {
      const old = previous[id];
      if (old !== undefined && old.dirty === next.dirty && old.pending === next.pending) return previous;
      return { ...previous, [id]: { dirty: next.dirty, pending: next.pending, since: next.dirty && old?.dirty !== true ? stamp : (old?.since ?? 0) } };
    });
  }, []);

  const forget = useCallback((id: string) => {
    discards.current.delete(id);
    setEntries((previous) => {
      if (!(id in previous)) return previous;
      return Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id));
    });
  }, []);

  const api = useMemo<HostApi>(() => ({ report, forget }), [report, forget]);
  const active = Object.entries(entries)
    .filter(([, entry]) => entry.dirty)
    .sort(([, a], [, b]) => b.since - a.since)[0];

  return (
    <HostContext.Provider value={api}>
      {children}
      <SaveBar
        dirty={active !== undefined}
        formId={active?.[0] ?? ""}
        pending={active?.[1].pending ?? false}
        onDiscard={() => {
          if (active !== undefined) discards.current.get(active[0])?.();
        }}
      />
    </HostContext.Provider>
  );
}

export function useSaveBarHost(): HostApi {
  const host = useContext(HostContext);
  if (host === null) throw new Error("A Business form section must sit inside SaveBarHost.");
  return host;
}
