"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { BriefcaseIcon, CardIcon, DocumentIcon, LinkIcon, MailIcon, MouseIcon, PercentIcon, PinIcon, PlusIcon, ShieldIcon, SignOutIcon, TagIcon, UsersIcon } from "@fynix/shared/ui/icons";
import { staffCan, type StaffCapability } from "@fynix/shared/lib/access";
import { cn } from "@fynix/shared/lib/cn";
import type { StaffRole } from "@fynix/db";
import { adminBrand } from "@/lib/brand";

/** The Journey map's own mark: the path from lead to live. */
function JourneyIcon({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M3 16.5c3-7 6-7 8-3.5s5 3.5 10-5" />
      <circle cx="3" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The Geography page's mark: a folded map. */
function GeographyIcon({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className={className}>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

interface DockItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** Shown only to roles that can do this. Left out, every role sees it. */
  readonly needs?: StaffCapability;
  /** Part of the Fynix product (the public directory and what is sold on it): a brand without a directory does not show it. */
  readonly directory?: true;
}

const ITEMS: readonly DockItem[] = [
  { href: "/", label: "Journey", icon: <JourneyIcon className="size-5" /> },
  { href: "/leads", label: "Leads", icon: <UsersIcon className="size-5" /> },
  { href: "/clients", label: "Clients", icon: <BriefcaseIcon className="size-5" /> },
  { href: "/coupons", label: "Coupons", icon: <TagIcon className="size-5" /> },
  { href: "/affiliates", label: "Affiliates", icon: <LinkIcon className="size-5" />, directory: true },
  { href: "/pricing", label: "Pricing", icon: <CardIcon className="size-5" />, needs: "money" },
  { href: "/invoices", label: "Invoices", icon: <DocumentIcon className="size-5" />, needs: "money" },
  { href: "/directory", label: "Directory", icon: <PinIcon className="size-5" />, directory: true },
  { href: "/geography", label: "Places", icon: <GeographyIcon className="size-5" />, directory: true },
  { href: "/ads", label: "Ads", icon: <MouseIcon className="size-5" />, directory: true },
  { href: "/deals", label: "Deals", icon: <PercentIcon className="size-5" />, directory: true },
  { href: "/leaving", label: "Leaving", icon: <SignOutIcon className="size-5" /> },
  { href: "/outbox", label: "Outbox", icon: <MailIcon className="size-5" /> },
  { href: "/access-log", label: "Access log", icon: <ShieldIcon className="size-5" />, needs: "oversight" },
];

/** "/" only matches itself; every other section also owns its sub-pages ("/leads/abc" is Leads). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Brings the current section into view in the scrolling bar. "auto" and not "smooth", so a reader who asked for less
 * motion never gets an animation; "nearest" on the block axis so the page itself never moves.
 */
export function centerActiveItem(nav: Pick<ParentNode, "querySelector"> | null): void {
  nav?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
}

interface DockProps {
  /** Shows a gold dot on Journey when someone is waiting on the team. */
  readonly needsYou: boolean;
  /** What the signed-in staff member may open: links their role cannot use are not shown. */
  readonly role: StaffRole;
  /** Whether this deployment runs the public directory; the sections for it are hidden when not. Defaults to the deployment's brand. */
  readonly directory?: boolean;
}

/**
 * The console's navigation: a glass bar floating at the bottom of the screen, like the marketing site's navbar.
 * Adding a lead sits at the end in gold, because it is the one thing started from anywhere. Fifteen links do not fit
 * a phone, so the bar scrolls sideways inside the screen and keeps the current page in view. From md the items are
 * 4rem wide (4.5rem from xl), which is the widest that still fits the whole bar, Add lead included, at 1024px.
 */
export function Dock({ needsYou, role, directory = adminBrand().sellsDirectory }: DockProps): ReactElement {
  const pathname = usePathname();
  // "Add lead" is its own action, not a section, so it never shows as the current page of Leads.
  const adding = pathname === "/leads/new";
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    centerActiveItem(navRef.current);
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label="Staff console"
      className="glass console-motion fixed inset-x-3 bottom-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-stretch justify-between gap-1 overflow-x-auto overscroll-x-contain rounded-[1.6rem] p-1.5 [scrollbar-width:none] shadow-[0_24px_60px_-24px_rgba(42,13,16,0.55)] md:inset-x-auto md:left-1/2 md:bottom-6 md:-translate-x-1/2 md:justify-start"
    >
      {ITEMS.filter((item) => (item.needs === undefined || staffCan(role, item.needs)) && (directory || item.directory === undefined)).map((item) => {
        const active = !adding && isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-[3.75rem] flex-auto shrink-0 flex-col items-center gap-1 rounded-[1.15rem] px-2 py-2 text-[0.6875rem] font-semibold transition-[background-color,color,translate] duration-300 ease-calm md:w-16 md:flex-none md:px-1 xl:w-[4.5rem] xl:px-2",
              active ? "bg-paper text-ink" : "text-paper/70 hover:-translate-y-0.5 hover:text-paper",
            )}
          >
            {item.icon}
            {item.label}
            {item.href === "/" && needsYou ? (
              <>
                <span aria-hidden="true" className="absolute right-[calc(50%-1.1rem)] top-1.5 size-2 rounded-full bg-gold ring-2 ring-ink" />
                <span className="sr-only">, something needs you</span>
              </>
            ) : null}
          </Link>
        );
      })}
      <span aria-hidden="true" className="mx-0.5 hidden w-px shrink-0 self-stretch bg-white/15 md:block" />
      <Link
        href="/leads/new"
        aria-current={adding ? "page" : undefined}
        aria-label="Add lead"
        className="flex min-w-[3.75rem] flex-auto shrink-0 flex-col items-center gap-1 rounded-[1.15rem] bg-gold px-2 py-2 text-[0.6875rem] font-semibold text-ink transition-[background-color,translate] duration-300 ease-calm hover:-translate-y-0.5 hover:bg-[#f5d08a] md:w-16 md:flex-none md:px-1 xl:w-[4.5rem] xl:px-2"
      >
        <PlusIcon className="size-5" />
        <span className="whitespace-nowrap md:hidden">Add</span>
        <span className="hidden whitespace-nowrap md:inline">Add lead</span>
      </Link>
    </nav>
  );
}
