import type { ReactElement, ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Something small beside the title, such as a count or a status. */
  readonly aside?: ReactNode;
  /** "attention" marks the one section that needs dealing with; nothing else on a page is emphasised this way. */
  readonly tone?: "plain" | "attention";
  readonly className?: string;
  /** An anchor an action's notice link can scroll back to, e.g. "features" for `?features=saved#features`. */
  readonly id?: string;
}

/** A titled part of a page: the title with a hairline under it, then the content. No card around it. */
export function Section({ title, children, aside, tone = "plain", className, id }: SectionProps): ReactElement {
  // Titles are unique within a page, so a slug of the title is a stable, server-safe id.
  const headingId = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-8 py-5", className)}>
      <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5", tone === "attention" ? "border-error" : "border-line")}>
        <h2 id={headingId} className={cn("font-display text-[0.9375rem] font-semibold tracking-[-0.01em]", tone === "attention" ? "text-error" : "text-ink")}>
          {title}
        </h2>
        {aside === undefined ? null : <div className="text-xs font-semibold tabular-nums text-ink-2">{aside}</div>}
      </div>
      {/* The title's hairline is already above: a list or empty line that opens the section drops its own top rule. */}
      <div className="mt-3 min-w-0 [&>p:first-child]:mt-0 [&>p:first-child]:border-t-0 [&>p:first-child]:pt-0 [&>ul:first-child]:mt-0 [&>ul:first-child]:border-t-0">{children}</div>
    </section>
  );
}

export interface Fact {
  readonly label: string;
  /** Null shows "Not given", so a missing answer is visible rather than a gap. */
  readonly value: ReactNode | null;
}

/** Label and value pairs in two columns on wide screens. */
export function FactList({ items }: { readonly items: readonly Fact[] }): ReactElement {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-ink-2">{item.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm tabular-nums">{item.value ?? <span className="text-ink-2">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Quiet text for a part of a record that has nothing in it yet. */
export function Quiet({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="text-sm text-ink-2">{children}</p>;
}
