import type { Icon } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT, PAGE_MAX, STACK } from "./classes";

interface PageHeaderProps {
  readonly title: string;
  readonly lede?: ReactNode;
  readonly action?: ReactNode;
  /** The page's tab bar, drawn under the title and its line. */
  readonly tabs?: ReactNode;
}

/** The title every v2 page opens with, one plain line under it, at the far end the page's actions, and under it the tab bar if the page has one. */
export function PageHeader({ title, lede, action, tabs }: PageHeaderProps): ReactElement {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.875rem] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
          {lede === undefined ? null : <p className="mt-2 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-2">{lede}</p>}
        </div>
        {action === undefined ? null : <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {tabs}
    </header>
  );
}

interface PageFrameProps extends PageHeaderProps {
  /** "page" (the default) fills the content area up to about 1560px; "form" is a narrow column for a page that is one form. Both sit on the left. */
  readonly width?: "page" | "form";
  readonly children: ReactNode;
}

/**
 * The frame every signed-in page sits in: the header, then the page's blocks one rhythm apart. It fills the content area
 * (the shell gives it its gutters), stops at about 1560px and stays on the left. It is also the container that PageColumns
 * and the Requests panes measure, so they follow the room the page has, not the size of the window.
 */
export function PageFrame({ width = "page", children, ...header }: PageFrameProps): ReactElement {
  return (
    <div className={cn("@container mr-auto w-full", STACK, width === "form" ? "max-w-[40rem]" : PAGE_MAX)}>
      <PageHeader {...header} />
      {children}
    </div>
  );
}

/**
 * A main column and a right-hand aside (360px, 400px when there is room). The aside drops below the main column when the
 * frame is narrower than 56rem, which is a 1024px window beside the rail, and stays in view while the main column scrolls from xl.
 */
export function PageColumns({ main, aside }: { readonly main: ReactNode; readonly aside: ReactNode | null }): ReactElement {
  // A page with nothing for the aside keeps its main column at full width instead of leaving 400px empty.
  if (aside === null) return <div className={cn(STACK, "min-w-0")}>{main}</div>;
  return (
    <div className="grid items-start gap-6 md:gap-8 @4xl:grid-cols-[minmax(0,1fr)_22.5rem] @5xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className={cn(STACK, "min-w-0")}>{main}</div>
      <aside className={cn(STACK, "min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain")}>{aside}</aside>
    </div>
  );
}

interface EmptyStateProps {
  readonly icon: Icon;
  /** One line: what is empty. */
  readonly title: string;
  /** One sentence: what will appear here, and when. */
  readonly text?: ReactNode;
  /** The one thing to do about it, a button or a link. Left out when there is nothing to do. */
  readonly action?: ReactNode;
  /** A line inside a section (left-aligned, no card) instead of the page's own empty state (a centred raised card). */
  readonly compact?: boolean;
}

/** What a page or a section says when it has nothing yet: a small icon, a title, a sentence about what will appear, and at most one action. */
export function EmptyState({ icon: Mark, title, text, action, compact = false }: EmptyStateProps): ReactElement {
  if (compact) {
    return (
      <div className="flex items-start gap-3 text-ink-2">
        <Mark size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {text === undefined ? null : <p className="mt-0.5 text-[0.84375rem] leading-relaxed">{text}</p>}
          {action === undefined ? null : <div className="mt-3">{action}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className={cn(LIFT, "grid justify-items-center px-6 py-16 text-center")}>
      <span aria-hidden="true" className="mb-4 grid size-11 place-items-center rounded-full bg-sunken text-ink-2">
        <Mark size={22} />
      </span>
      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {text === undefined ? null : <p className="mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">{text}</p>}
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A section that sits on the page: its title with a hairline under it, then what it holds. No box around it. */
export function PageSection({
  id,
  title,
  aside,
  className,
  flush = false,
  children,
}: {
  /** Makes the heading's id (`${id}-title`), which names the section for a screen reader. */
  readonly id: string;
  readonly title: string;
  /** A short link or figure at the far end of the title. */
  readonly aside?: ReactNode;
  readonly className?: string;
  /** The rows carry their own top padding, so the section adds none under its title. */
  readonly flush?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
        <h2 id={`${id}-title`} className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {aside === undefined ? null : <div className="shrink-0 text-[0.9375rem] text-ink-2">{aside}</div>}
      </div>
      <div className={flush ? undefined : "pt-4"}>{children}</div>
    </section>
  );
}

/** Facts as rows split by hairlines: a quiet label on the left, the value on the right (under it on a phone). */
export function FactRows({
  items,
  className,
}: {
  readonly items: readonly { readonly label: string; readonly value: ReactNode }[];
  readonly className?: string;
}): ReactElement {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-[0.9375rem] text-ink-2">{item.label}</dt>
          <dd className="min-w-0 break-words text-base text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One thing the person can do, as a row: one plain line about it, with its soft button at the far end. */
export function ActionRow({ title, text, action }: { readonly title?: string; readonly text: ReactNode; readonly action: ReactNode }): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-xl">
        {title === undefined ? null : <p className="text-base font-semibold text-ink">{title}</p>}
        <p className={title === undefined ? "text-[0.9375rem] leading-relaxed text-ink-2" : "mt-1 text-[0.9375rem] leading-relaxed text-ink-2"}>{text}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
