import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ChevronRightIcon } from "@brandbasket/shared/ui/icons";

interface HairlineListProps {
  /** Names the list for screen readers, e.g. "Leads". */
  readonly label: string;
  readonly children: ReactNode;
}

/** Rows divided by hairlines, no card around them. */
export function HairlineList({ label, children }: HairlineListProps): ReactElement {
  return (
    <ul aria-label={label} className="mt-4 border-t border-line">
      {children}
    </ul>
  );
}

interface HairlineRowProps {
  readonly href: string;
  /** An avatar or mark at the start. */
  readonly lead?: ReactNode;
  readonly title: ReactNode;
  /** One quiet line under the title. */
  readonly sub?: ReactNode;
  /** Status, shown from small screens up. */
  readonly meta?: ReactNode;
  /** A time or figure at the end, shown from medium screens up. */
  readonly trail?: ReactNode;
}

/** A whole-row link. */
export function HairlineRow({ href, lead, title, sub, meta, trail }: HairlineRowProps): ReactElement {
  return (
    <li className="border-b border-line">
      <Link
        href={href}
        className="console-motion group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-1 py-3 transition-colors duration-200 hover:bg-surface sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:grid-cols-[auto_minmax(0,1fr)_minmax(9rem,auto)_minmax(8rem,auto)_auto]"
      >
        <span className="flex">{lead}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          {sub === undefined ? null : <span className="mt-0.5 block truncate text-xs tabular-nums text-ink-2">{sub}</span>}
        </span>
        <span className="hidden sm:flex">{meta}</span>
        <span className="hidden text-right font-figure text-xs tabular-nums text-ink-2 md:block">{trail}</span>
        <ChevronRightIcon className="size-4 text-ink-2 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
      </Link>
    </li>
  );
}

/** One line in place of a list, when there is nothing to show. */
export function EmptyLine({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="mt-4 border-t border-line pt-4 text-sm text-ink-2">{children}</p>;
}
