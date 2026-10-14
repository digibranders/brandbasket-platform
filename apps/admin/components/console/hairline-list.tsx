import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ChevronRightIcon } from "@firstfold/shared/ui/icons";

interface HairlineListProps {
  /** Names the list for screen readers, e.g. "Leads". */
  readonly label: string;
  readonly children: ReactNode;
}

/** Rows divided by hairlines, no card around them: the page's whitespace is the container. */
export function HairlineList({ label, children }: HairlineListProps): ReactElement {
  return (
    <ul aria-label={label} className="mt-6 border-t border-line">
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

/** A whole-row link. Hover warms the row and nudges it, so the target is obvious without a button per row. */
export function HairlineRow({ href, lead, title, sub, meta, trail }: HairlineRowProps): ReactElement {
  return (
    <li className="border-b border-line">
      <Link
        href={href}
        className="console-motion group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 pl-1 pr-2 transition-[background-color,padding] duration-300 ease-calm hover:bg-ink/[0.03] hover:pl-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:grid-cols-[auto_minmax(0,1fr)_minmax(9rem,auto)_minmax(8rem,auto)_auto]"
      >
        <span className="flex">{lead}</span>
        <span className="min-w-0">
          <span className="block truncate text-[0.98rem] font-semibold text-ink">{title}</span>
          {sub === undefined ? null : <span className="mt-0.5 block truncate text-sm tabular-nums text-ink-soft">{sub}</span>}
        </span>
        <span className="hidden sm:flex">{meta}</span>
        <span className="hidden text-right text-sm tabular-nums text-ink-soft md:block">{trail}</span>
        <ChevronRightIcon className="size-4 text-ink-soft/60 transition-transform duration-300 ease-calm group-hover:translate-x-0.5 group-hover:text-ink" />
      </Link>
    </li>
  );
}

/** One line in place of a list, when there is nothing to show. */
export function EmptyLine({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="mt-8 border-t border-line pt-6 text-ink-soft">{children}</p>;
}
