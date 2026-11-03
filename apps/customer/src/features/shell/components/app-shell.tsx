"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banner } from "@/ui";
import type { ShellView } from "../loader";
import { countOf, isSearchShortcut, navModel, phoneTabs, searchTargets } from "../rules";
import { BillingBanner } from "./billing-banner";
import { CommandSearch } from "./command-search";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

/**
 * The signed-in workspace's frame (plan 60, section 9): sticky sidebar, sticky top bar and one scrolling page column on
 * desktop; top bar, page and a five-tab bar on phones. Holds search (Command or Control K) and the billing banner.
 */
export function AppShell({ view, children }: { readonly view: ShellView; readonly children: ReactNode }) {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const model = useMemo(
    () =>
      navModel({
        services: view.business.services,
        kickoffOver: view.kickoffOver,
        enquiries: countOf(view.enquiries),
        requests: countOf(view.requests),
      }),
    [view.business.services, view.kickoffOver, view.enquiries, view.requests],
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
      <div className="flex min-h-dvh bg-sidebar md:h-dvh md:overflow-hidden">
        <Sidebar
          model={model}
          pathname={pathname}
          businessName={view.business.name}
          services={view.business.services}
          person={view.person}
          onSearch={openSearch}
          onSignOutError={setSignOutError}
        />
        {/* Desktop: the page is a raised sheet that scrolls on its own, on the sidebar's grey (sidebar option 2). */}
        <div className="flex min-w-0 flex-1 flex-col bg-canvas md:my-2 md:mr-2 md:overflow-y-auto md:rounded-overlay md:shadow-sheet">
          <TopBar
            model={model}
            pathname={pathname}
            businessName={view.business.name}
            person={view.person}
            notifications={view.notifications}
            onSearch={openSearch}
            onSignOutError={setSignOutError}
          />
          <main id="page" tabIndex={-1} className="mx-auto w-full max-w-page px-gutter pt-4 pb-12 outline-none md:pt-5">
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
