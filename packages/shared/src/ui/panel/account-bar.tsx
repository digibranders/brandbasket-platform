"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  BellIcon,
  BookIcon,
  EllipsisIcon,
  HomeIcon,
  LifebuoyIcon,
  ScrollTextIcon,
  SettingsIcon,
  SignOutIcon,
} from "@brandbasket/shared/ui/icons";
import { cn } from "../../lib/cn";
import { initialsOf } from "../../lib/names";
import { actionableCount, siteStatusLine, type AccountPanel } from "../../lib/account-panel";

export interface AccountBarAccount {
  readonly name: string;
  readonly email: string;
  /** The account page, when the surface has one. Staff have none, so their menu shows no Settings. */
  readonly href?: string;
}

interface AccountBarProps {
  readonly account: AccountBarAccount;
  /** Customer surfaces only. Null on the staff console, which has no single business in view. */
  readonly panel: AccountPanel | null;
  /** The app's own sign-out action. Passed in: the two apps sign out through different actions. */
  readonly signOut: () => Promise<void>;
  readonly dark: boolean;
  /** Where "Docs" goes — the marketing site, which is a separate app. */
  readonly docsUrl: string;
  /**
   * Where "Help" goes: the app's own place to ask (the customer dashboard's Ask for a change form), or a `mailto:` address
   * for a surface that has none. A `mailto:` is opened as an external link.
   */
  readonly helpHref: string;
  /** Which way the popovers open: "top" in the sidebar footer, "bottom" in the mobile header. */
  readonly placement?: "top" | "bottom";
}

/**
 * Opens and closes one popover: outside click, Escape, and focus handling, which every menu needs and none of them
 * should reimplement. Focus moves to the panel's first focusable child on open and returns to the trigger on close,
 * so the keyboard never ends up somewhere the eye is not.
 */
function usePopover(): {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
  readonly panelRef: React.RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const panel = panelRef.current;
      if (panel === null || !panel.contains(document.activeElement)) return;
      event.preventDefault();
      const items = Array.from(panel.querySelectorAll<HTMLElement>("[data-menu-item]"));
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef, triggerRef, panelRef };
}

function iconButtonClass(dark: boolean, active: boolean): string {
  return cn(
    "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-calm cursor-pointer",
    dark
      ? active
        ? "bg-white/10 text-paper"
        : "text-paper/55 hover:bg-white/5 hover:text-paper"
      : active
        ? "bg-paper-deep text-ink"
        : "text-ink-soft hover:bg-paper-deep/60 hover:text-ink",
  );
}

/**
 * The sidebar footer opens upwards; the mobile header bar opens downwards, since there is nothing above it.
 *
 * The horizontal inset resolves against the bar, not against the small icon button that opened it (which is why
 * neither trigger's wrapper is positioned). A panel anchored to the button instead would be wider than the 16rem
 * sidebar and spill out over the page.
 *
 * It is pulled slightly wider than the bar so the menu reads as its own surface rather than a continuation of it.
 * The desktop figure is the larger of the two: there it has the sidebar's gutters to grow into, whereas on phones
 * the bar already sits a thumb's width from the screen edge.
 */
function panelClass(dark: boolean, placement: "top" | "bottom"): string {
  return cn(
    "absolute -inset-x-2 z-30 overflow-hidden rounded-card border shadow-lg lg:-inset-x-3",
    placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
    dark ? "border-white/15 bg-dark-raised" : "border-line bg-card",
  );
}

/**
 * Text inside the dark popovers is paper at 80% (7.5:1 on dark-raised). It was 55% in places, which is 4.3:1 on the
 * lifted panel ground and fails 4.5:1; one strength for every line keeps the menu from having a faded tier.
 */
function menuItemClass(dark: boolean): string {
  return cn(
    "flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition-colors duration-300 ease-calm cursor-pointer",
    dark ? "text-paper/80 hover:bg-white/5 hover:text-paper" : "text-ink-soft hover:bg-paper-deep/60 hover:text-ink",
  );
}

interface MenuRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly dark: boolean;
  readonly onSelect: () => void;
}

/** One row of the account menu, as a link, an external link, or a submit button — whichever the destination needs. */
function MenuLink({ href, external, icon, label, dark, onSelect }: MenuRowProps & { readonly href: string; readonly external?: boolean }): ReactElement {
  const content = (
    <>
      <span>{label}</span>
      <span aria-hidden="true" className="shrink-0 opacity-70">
        {icon}
      </span>
    </>
  );
  if (external) {
    return (
      <a
        data-menu-item
        role="menuitem"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={menuItemClass(dark)}
        onClick={onSelect}
      >
        {content}
      </a>
    );
  }
  return (
    <Link data-menu-item role="menuitem" href={href} className={menuItemClass(dark)} onClick={onSelect}>
      {content}
    </Link>
  );
}

export function AccountBar({ signOut, account,
  panel,
  dark,
  docsUrl,
  helpHref,
  placement = "top",
}: AccountBarProps): ReactElement {
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    rootRef: menuRootRef,
    triggerRef: menuTriggerRef,
    panelRef: menuPanelRef,
  } = usePopover();
  const {
    open: bellOpen,
    setOpen: setBellOpen,
    rootRef: bellRootRef,
    triggerRef: bellTriggerRef,
    panelRef: bellPanelRef,
  } = usePopover();
  const menuId = useId();
  const bellId = useId();

  const closeMenu = useCallback(() => setMenuOpen(false), [setMenuOpen]);
  const notices = panel?.notices ?? [];
  const needsYou = actionableCount(notices);
  // A site that is not live yet has nothing to report, so the menu shows no status line for it.
  const status = panel === null || panel.siteStatus.kind === "not_launched" ? null : siteStatusLine(panel.siteStatus);

  return (
    <div
      className={cn(
        "relative flex items-center gap-1 rounded-control px-2 py-1.5",
        dark ? "bg-white/[0.04]" : "bg-paper-deep/50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full font-serif text-sm",
          dark ? "bg-white/10 text-accent-pale" : "bg-accent-pale text-accent-deep",
        )}
      >
        {initialsOf(account.name)}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", dark ? "text-paper" : "text-ink")}>
        {account.name}
      </span>

      <div ref={menuRootRef}>
        <button
          ref={menuTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen(!menuOpen)}
          className={iconButtonClass(dark, menuOpen)}
        >
          <EllipsisIcon className="size-5" />
          <span className="sr-only">Account menu</span>
        </button>

        {!menuOpen ? null : (
          <div ref={menuPanelRef} id={menuId} role="menu" aria-label="Account" className={panelClass(dark, placement)}>
            <div className={cn("flex items-center gap-3 border-b px-5 py-4", dark ? "border-white/10" : "border-line")}>
              <span className={cn("min-w-0 flex-1 truncate text-sm", dark ? "text-paper/80" : "text-ink-soft")}>
                {account.email}
              </span>
            </div>
            {account.href === undefined ? null : (
              <MenuLink href={account.href} icon={<SettingsIcon className="size-4" />} label="Settings" dark={dark} onSelect={closeMenu} />
            )}

            {panel?.liveWebsiteUrl == null ? null : (
              <MenuLink
                href={panel.liveWebsiteUrl}
                external
                icon={<HomeIcon className="size-4" />}
                label="Home page"
                dark={dark}
                onSelect={closeMenu}
              />
            )}
            {panel === null ? null : (
              <MenuLink
                href="/changelog"
                icon={<ScrollTextIcon className="size-4" />}
                label="What’s new"
                dark={dark}
                onSelect={closeMenu}
              />
            )}
            <MenuLink
              href={helpHref}
              external={helpHref.startsWith("mailto:")}
              icon={<LifebuoyIcon className="size-4" />}
              label="Help"
              dark={dark}
              onSelect={closeMenu}
            />
            <MenuLink
              href={docsUrl}
              external
              icon={<BookIcon className="size-4" />}
              label="Docs"
              dark={dark}
              onSelect={closeMenu}
            />

            <form action={signOut} className={cn("border-t", dark ? "border-white/10" : "border-line")}>
              <button data-menu-item role="menuitem" type="submit" className={menuItemClass(dark)}>
                <span>Sign out</span>
                <span aria-hidden="true" className="shrink-0 opacity-70">
                  <SignOutIcon className="size-4" />
                </span>
              </button>
            </form>

            {status === null ? null : (
              <p
                className={cn(
                  "flex items-center gap-2 border-t px-5 py-3 text-xs",
                  dark ? "border-white/10 text-paper/80" : "border-line text-ink-soft",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    status.tone === "ok" ? "bg-emerald-500" : status.tone === "warn" ? "bg-accent" : "bg-ink-soft/40",
                  )}
                />
                {status.text}
              </p>
            )}
          </div>
        )}
      </div>

      {panel === null && notices.length === 0 ? null : (
        <div ref={bellRootRef}>
          <button
            ref={bellTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={bellOpen}
            aria-controls={bellOpen ? bellId : undefined}
            onClick={() => setBellOpen(!bellOpen)}
            className={iconButtonClass(dark, bellOpen)}
          >
            <BellIcon className="size-5" />
            {needsYou === 0 ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-1.5 top-1.5 size-2 rounded-full ring-2",
                  dark ? "bg-gold ring-dark-surface" : "bg-accent ring-card",
                )}
              />
            )}
            {/* The dot is never the only indicator: the label carries the same count for anyone not looking at it. */}
            <span className="sr-only">
              {needsYou === 0 ? "Notices" : `Notices, ${String(needsYou)} ${needsYou === 1 ? "needs" : "need"} you`}
            </span>
          </button>

          {!bellOpen ? null : (
            <div
              ref={bellPanelRef}
              id={bellId}
              role="menu"
              aria-label="Notices"
              className={panelClass(dark, placement)}
            >
              {notices.length === 0 ? (
                <p className={cn("px-5 py-4 text-sm", dark ? "text-paper/80" : "text-ink-soft")}>
                  Nothing needs you right now.
                </p>
              ) : (
                notices.map((notice) =>
                  notice.href === null ? (
                    <p key={notice.id} className={cn("px-5 py-3 text-sm", dark ? "text-paper/80" : "text-ink-soft")}>
                      {notice.text}
                    </p>
                  ) : (
                    <Link
                      key={notice.id}
                      data-menu-item
                      role="menuitem"
                      href={notice.href}
                      onClick={() => setBellOpen(false)}
                      className={menuItemClass(dark)}
                    >
                      <span className={cn(notice.actionable && (dark ? "text-paper" : "text-ink"))}>{notice.text}</span>
                      {!notice.actionable ? null : (
                        <span
                          aria-hidden="true"
                          className={cn("size-2 shrink-0 rounded-full", dark ? "bg-gold" : "bg-accent")}
                        />
                      )}
                    </Link>
                  ),
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
