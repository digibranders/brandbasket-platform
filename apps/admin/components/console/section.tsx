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

/**
 * A titled part of a record page. The title sits in its own column on wide screens, so a long page reads like a
 * well-set document rather than a stack of cards.
 */
export function Section({ title, children, aside, tone = "plain", className, id }: SectionProps): ReactElement {
  // Titles are unique within a page, so a slug of the title is a stable, server-safe id.
  const headingId = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "grid scroll-mt-8 gap-x-10 gap-y-4 border-t py-8 lg:grid-cols-[13rem_minmax(0,1fr)]",
        tone === "attention" ? "border-accent" : "border-line",
        className,
      )}
    >
      <div>
        <h2
          id={headingId}
          className={cn("font-serif text-[1.375rem] leading-tight", tone === "attention" && "text-accent")}
        >
          {title}
        </h2>
        {aside === undefined ? null : <div className="mt-2 text-sm tabular-nums text-ink-soft">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export interface Fact {
  readonly label: string;
  /** Null shows a dash, so a missing answer is visible rather than a gap. */
  readonly value: ReactNode | null;
}

/** Label and value pairs in two columns on wide screens. */
export function FactList({ items }: { readonly items: readonly Fact[] }): ReactElement {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-ink-soft">{item.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words tabular-nums">
            {item.value ?? <span className="text-ink-soft">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Quiet text for a part of a record that has nothing in it yet. */
export function Quiet({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="text-ink-soft">{children}</p>;
}
