"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { SupportContext } from "@fynix/shared/ui/panel/support-context";
import { readSupportUnreadCount } from "@/app/app-host/(support)/support/actions";

const SupportDialog = dynamic(() => import("./support-dialog"), { ssr: false });

export function SupportProvider({ children, canCreate }: { readonly children: ReactNode; readonly canCreate: boolean }): ReactElement {
  const [request, setRequest] = useState<{ readonly category: "support" | null } | null>(null);
  const [unread, setUnread] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const refresh = useCallback(() => { void readSupportUnreadCount().then(setUnread).catch(() => undefined); }, []);
  useEffect(() => {
    refresh(); window.addEventListener("focus", refresh); window.addEventListener("fynix:support-read", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("fynix:support-read", refresh); };
  }, [refresh]);
  useEffect(() => { refresh(); }, [pathname, refresh]);
  const open = useCallback((category: "support" | null, trigger: HTMLElement | null): void => {
    returnFocus.current = trigger; setRequest({ category });
  }, []);
  const close = useCallback((): void => {
    setRequest(null); returnFocus.current?.focus(); refresh();
  }, [refresh]);
  const value = useMemo(() => ({ open, unread }), [open, unread]);
  return <SupportContext.Provider value={value}>{children}{request === null ? null : <SupportDialog initialCategory={request.category} canCreate={canCreate} onClose={close} />}</SupportContext.Provider>;
}
