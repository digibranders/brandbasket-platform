import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/** The title every v2 page opens with, one plain line under it, and at the far end the page's one action or link. */
export function PageHeader({
  title,
  lede,
  action,
}: {
  readonly title: string;
  readonly lede?: ReactNode;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">{title}</h1>
        {lede === undefined ? null : <p className="mt-2 max-w-2xl text-[0.84375rem] leading-relaxed text-ink-2">{lede}</p>}
      </div>
      {action === undefined ? null : <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/** A section that sits on the page: its title with a hairline under it, then what it holds. No box around it. */
export function PageSection({
  id,
  title,
  aside,
  className,
  children,
}: {
  /** Makes the heading's id (`${id}-title`), which names the section for a screen reader. */
  readonly id: string;
  readonly title: string;
  /** A short link or figure at the far end of the title. */
  readonly aside?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={`${id}-title`} className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
        <h2 id={`${id}-title`} className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {aside === undefined ? null : <div className="shrink-0 text-[0.8125rem] text-ink-2">{aside}</div>}
      </div>
      <div className="pt-4">{children}</div>
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
          <dt className="text-[0.8125rem] text-ink-2">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm text-ink">{item.value}</dd>
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
        {title === undefined ? null : <p className="text-sm font-semibold text-ink">{title}</p>}
        <p className={title === undefined ? "text-sm leading-relaxed text-ink-2" : "mt-1 text-sm leading-relaxed text-ink-2"}>{text}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
