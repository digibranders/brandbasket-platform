"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ServiceMark } from "@/components";
import { Icon, Menu, MenuItem } from "@/ui";
import { cx } from "@/ui/cx";
import { linkIsCurrent, type PhoneTab } from "../rules";
import { countWords } from "./nav-item";

const TAB =
  "relative flex min-h-tab flex-col items-center justify-center gap-0.5 rounded-control type-label no-underline focus-visible:outline-2 focus-visible:outline-ring";

/** The phone's bottom tab bar (plan 60, section 9): four tabs and More, or Services and More as menus of links. */
export function TabBar({ tabs, pathname }: { readonly tabs: readonly PhoneTab[]; readonly pathname: string }) {
  const router = useRouter();
  return (
    <nav
      aria-label="Main tabs"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface px-1 pt-1.5 md:hidden"
      style={{ paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}
    >
      {tabs.map((tab) => {
        if (tab.kind === "link") {
          const current = linkIsCurrent(tab.link, pathname);
          return (
            <Link key={tab.link.href} href={tab.link.href} aria-current={current ? "page" : undefined} className={cx(TAB, current ? "font-semibold text-accent-text" : "text-ink-3")}>
              <Icon name={tab.link.icon} filled={current} />
              {tab.label}
              {tab.link.count === undefined ? null : (
                <span className="absolute top-0.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-warn-text px-1 text-center type-label text-on-primary">
                  <span aria-hidden>{tab.link.count}</span>
                  <span className="sr-only">
                    , {tab.link.count} {countWords(tab.link)}
                  </span>
                </span>
              )}
            </Link>
          );
        }
        const current = tab.links.some((link) => linkIsCurrent(link, pathname));
        return (
          <Menu
            key={tab.id}
            align={tab.id === "more" ? "end" : "start"}
            trigger={
              <button type="button" className={cx(TAB, current ? "font-semibold text-accent-text" : "text-ink-3")}>
                <Icon name={tab.icon} />
                {tab.label}
              </button>
            }
          >
            {tab.links.map((link) => (
              <MenuItem key={link.href} icon={link.icon} onClick={() => router.push(link.href)}>
                <span className="flex-1">
                  {link.label}
                  {link.bought === false ? <span className="sr-only">, not on your plan</span> : null}
                </span>
                {link.service === undefined ? null : <ServiceMark service={link.service} bought={link.bought !== false} />}
              </MenuItem>
            ))}
          </Menu>
        );
      })}
    </nav>
  );
}
