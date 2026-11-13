"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Banner } from "@/ui";
import { cx } from "@/ui/cx";
import type { ShellView } from "../loader";
import { countOf, isSearchShortcut, navModel, phoneTabs, searchTargets, SHELL_PATHS } from "../rules";
import { BillingBanner } from "./billing-banner";
import { CommandSearch } from "./command-search";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

const COLLAPSED_KEY = "bb.sidebar.collapsed";
const collapsedListeners = new Set<() => void>();

/** The folded state lives in this browser's storage (blocked storage reads as open and still toggles for the visit). */
let collapsedFallback = false;

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return collapsedFallback;
  }
}

function subscribeCollapsed(listener: () => void): () => void {
  collapsedListeners.add(listener);
  return () => collapsedListeners.delete(listener);
}

function toggleCollapsed(): void {
  const next = !readCollapsed();
  collapsedFallback = next;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // Not remembered beyond this visit.
  }
  collapsedListeners.forEach((listener) => listener());
}

/**
 * The signed-in workspace's frame (plan 60, section 9): sticky sidebar, sticky top bar and one scrolling page column on
 * desktop; top bar, page and a five-tab bar on phones. Holds search (Command or Control K), the billing banner and
 * whether the sidebar is folded to its icon rail (kept in this browser; the page works without storage).
 */
export function AppShell({ view, children }: { readonly view: ShellView; readonly children: ReactNode }) {
  const pathname = usePathname();
  // Social media pages have a channels column that sits against the menu, so their page does not stop at the usual width.
  const fillsWidth = pathname === SHELL_PATHS.social || pathname.startsWith(`${SHELL_PATHS.social}/`);
  const [searching, setSearching] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  const model = useMemo(
    () =>
      navModel({
        services: view.business.services,
        kickoffOver: view.kickoffOver,
        enquiries: countOf(view.enquiries),
        requests: countOf(view.requests),
        ...(view.reports.ok ? { reports: view.reports.data } : {}),
      }),
    [view.business.services, view.kickoffOver, view.enquiries, view.requests, view.reports],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      setSearching(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openSearch = () => setSearching(true);

  return (
    <>
      <a
        href="#page"
        className="sr-only z-60 rounded-control bg-primary px-3 py-2 type-button text-on-primary no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar
          model={model}
          pathname={pathname}
          businessName={view.business.name}
          services={view.business.services}
          person={view.person}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onSignOutError={setSignOutError}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            model={model}
            pathname={pathname}
            businessName={view.business.name}
            person={view.person}
            notifications={view.notifications}
            onSearch={openSearch}
            onSignOutError={setSignOutError}
          />
          <main id="page" tabIndex={-1} className={cx("mx-auto w-full px-gutter pt-4 pb-12 outline-none md:pt-5", fillsWidth ? "social-pointer max-w-none" : "max-w-page")}>
            {signOutError === null ? null : (
              <Banner tone="neg" className="mb-4">
                {signOutError}
              </Banner>
            )}
            <BillingBanner state={view.banner} />
            {children}
            {/* Room for the phone tab bar, so the last row is never under it. */}
            <div aria-hidden className="h-16 md:hidden" />
          </main>
        </div>
      </div>
      <TabBar tabs={phoneTabs(model, view.kickoffOver)} pathname={pathname} />
      <CommandSearch open={searching} onOpenChange={setSearching} targets={searchTargets(model)} />
    </>
  );
}
