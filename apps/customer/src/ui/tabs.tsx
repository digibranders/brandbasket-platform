"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

const LIST = "flex gap-5 overflow-x-auto border-b border-border";
const TAB =
  "-mb-px inline-flex h-tab shrink-0 items-center gap-2 border-b-2 border-transparent type-body whitespace-nowrap text-ink-3 no-underline transition-colors duration-100 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:h-10";
const CURRENT = "border-primary font-medium text-ink";
const COUNT = "rounded-full bg-neutral-wash px-1.5 type-label text-neutral-text";

export interface TabLink {
  readonly href: string;
  readonly label: ReactNode;
  /** Already written for reading. */
  readonly count?: ReactNode;
}

/** Underline tabs where each tab is its own URL (plan 60, Tabs): a page's sections. */
export function TabLinks({ items, current, "aria-label": label }: { readonly items: readonly TabLink[]; readonly current: string; readonly "aria-label": string }) {
  return (
    <nav aria-label={label} className={LIST}>
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cx(TAB, active && CURRENT)}>
            {item.label}
            {item.count === undefined ? null : <span className={COUNT}>{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export interface TabsProps {
  readonly items: readonly { readonly value: string; readonly label: ReactNode; readonly count?: ReactNode }[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly "aria-label": string;
  /** One TabPanel per item. */
  readonly children: ReactNode;
}

/** Tabs that switch panels in place, inside a sheet or dialog. Arrow keys move between tabs. Pages use TabLinks. */
export function Tabs({ items, value, defaultValue, onValueChange, "aria-label": label, children }: TabsProps) {
  return (
    <BaseTabs.Root value={value} defaultValue={defaultValue ?? items[0]?.value} onValueChange={(next) => onValueChange?.(String(next))}>
      <BaseTabs.List aria-label={label} className={LIST}>
        {items.map((item) => (
          <BaseTabs.Tab key={item.value} value={item.value} className={cx(TAB, "data-active:border-primary data-active:font-medium data-active:text-ink")}>
            {item.label}
            {item.count === undefined ? null : <span className={COUNT}>{item.count}</span>}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

export function TabPanel({ value, children, className }: { readonly value: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <BaseTabs.Panel value={value} className={cx("pt-4 outline-none", className)}>
      {children}
    </BaseTabs.Panel>
  );
}
