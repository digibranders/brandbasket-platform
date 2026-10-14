"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon } from "../icons";

export interface SidebarNavChild {
  readonly href: string;
  readonly label: string;
}

export interface SidebarNavItem {
  /** Where the row goes. A group's own row only opens and closes it, so this is just its key: its first child. */
  readonly href: string;
  readonly label: string;
  /** Rendered on the server and passed through, so the list itself can stay a plain array. */
  readonly icon: ReactNode;
  /** Sub-sections, e.g. Content → Blogs, Authors. The group opens while one of them is the current page. */
  readonly children?: readonly SidebarNavChild[];
  /** Starts a new section of the menu: a hairline is drawn above this row. The first row never needs one. */
  readonly sectionStart?: boolean;
  /** Something new in this section, shown as a small pill on the right and spoken after the label. Left off at zero. */
  readonly count?: number;
}

interface SidebarNavProps {
  readonly items: readonly SidebarNavItem[];
  /** "dark" (both dashboards today) is the deep-burgundy sidebar; "light" is the cream one. */
  readonly variant?: "light" | "dark";
}

/**
 * Section links for a dashboard sidebar. The root link only matches itself; the rest match their subpages too. A group
 * (an item with children) is a dropdown: its row carries a chevron and opens or closes the list of children beneath
 * it, starting open while one of them is the current page. On phones, where the sections run in one scrolling row,
 * an open group's children follow it in that row instead, and the hairlines between sections are left out.
 *
 * The current page is a translucent white highlight with bold text, and `aria-current`; there is no marker on its edge.
 * Inactive links on the dark sidebar are paper at 75% (7.9:1 on dark-surface). `tabular-nums` because a label can
 * change while the page is open.
 *
 * A count pill is hidden on the page it counts: telling someone something new arrived in the section they are already
 * reading is noise, and the figure is only as fresh as the layout's last render.
 */
export function SidebarNav({ items, variant = "light" }: SidebarNavProps): ReactElement {
  const pathname = usePathname();
  const isCurrent = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const dark = variant === "dark";
  // Groups the customer has opened or closed by hand; until then a group is open exactly while it is current.
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});

  const rowClass = (current: boolean, bold = current): string =>
    cn(
      "relative flex items-center gap-[0.6875rem] rounded-[0.625rem] py-3 pl-4 pr-2.5 text-sm transition-colors duration-300 ease-calm lg:py-2",
      bold ? "font-bold" : "font-medium",
      dark
        ? current
          ? "bg-white/10 text-paper"
          : bold
            ? "text-paper hover:bg-white/5"
            : "text-paper/75 hover:bg-white/5 hover:text-paper"
        : current
          ? "bg-paper-deep text-ink"
          : bold
            ? "text-ink hover:bg-paper-deep/60"
            : "text-ink-soft hover:bg-paper-deep/60 hover:text-ink",
    );

  return (
    <nav aria-label="Sections">
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {items.map((item) => {
          const children = item.children ?? [];
          const current = children.length > 0 ? children.some((child) => isCurrent(child.href)) : isCurrent(item.href);
          const isGroup = children.length > 0;
          const open = isGroup && (toggled[item.href] ?? current);
          const listId = `nav-group-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;
          const count = item.count !== undefined && item.count > 0 && !current ? item.count : null;
          return (
            <li
              key={item.href}
              className={cn(
                "contents lg:block",
                item.sectionStart === true && "lg:mt-2 lg:border-t lg:pt-2",
                item.sectionStart === true && (dark ? "lg:border-paper/20" : "lg:border-line"),
              )}
            >
              {isGroup ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setToggled((state) => ({ ...state, [item.href]: !open }))}
                  // A group is not a page, so it is never highlighted: it turns bold while one of its pages is current.
                  className={cn(rowClass(false, current), "w-full text-left")}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">{item.label}</span>
                  <ChevronDownIcon
                    className={cn(
                      "ml-auto size-4 shrink-0 transition-transform duration-300 ease-calm",
                      open && "rotate-180",
                    )}
                  />
                </button>
              ) : (
                <Link href={item.href} aria-current={current ? "page" : undefined} className={rowClass(current)}>
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">{item.label}</span>
                  {count === null ? null : (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "ml-auto min-w-5 rounded-full px-[0.4375rem] text-center text-xs font-semibold tabular-nums",
                          dark ? "bg-paper text-ink" : "bg-ink text-paper",
                        )}
                      >
                        {count}
                      </span>
                      <span className="sr-only">, {count} new</span>
                    </>
                  )}
                </Link>
              )}
              {open ? (
                <ul
                  id={listId}
                  className={cn(
                    "contents lg:ml-6 lg:mt-0.5 lg:flex lg:flex-col lg:gap-0.5 lg:border-l",
                    dark ? "lg:border-paper/15" : "lg:border-line",
                  )}
                >
                  {children.map((child) => {
                    const childCurrent = isCurrent(child.href);
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          aria-current={childCurrent ? "page" : undefined}
                          className={cn(
                            "flex items-center whitespace-nowrap rounded-[0.625rem] px-4 py-3 text-sm transition-colors duration-300 ease-calm lg:py-2",
                            dark
                              ? childCurrent
                                ? "bg-white/10 font-bold text-paper"
                                : "text-paper/65 hover:text-paper"
                              : childCurrent
                                ? "bg-paper-deep font-bold text-ink"
                                : "text-ink-soft hover:text-ink",
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
