import type { ReactElement } from "react";
import type { SupportCategory, SupportStatus } from "../../lib/support";
import { SUPPORT_CATEGORY_LABELS } from "../../lib/support";
import { cn } from "../../lib/cn";

export interface SupportStatusBadgeProps {
  readonly status: SupportStatus;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

const STATUS_CONFIG: Record<
  SupportStatus,
  {
    readonly label: string;
    readonly tone: string;
    readonly dotColor?: string;
  }
> = {
  waiting_on_you: {
    label: "Waiting on you",
    tone: "bg-accent-pale text-accent-deep ring-1 ring-accent/30 font-semibold",
    dotColor: "bg-accent-deep",
  },
  in_progress: {
    label: "In progress",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30 font-medium",
    dotColor: "bg-amber-500",
  },
  new: {
    label: "Submitted",
    tone: "bg-sky-500/15 text-sky-800 dark:text-sky-300 ring-1 ring-sky-500/30 font-medium",
    dotColor: "bg-sky-500",
  },
  triaged: {
    label: "Under review",
    tone: "bg-paper-deep text-ink ring-1 ring-line font-medium",
    dotColor: "bg-ink-soft",
  },
  resolved: {
    label: "Resolved",
    tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30 font-medium",
    dotColor: "bg-emerald-500",
  },
  closed: {
    label: "Closed",
    tone: "bg-paper-deep/60 text-ink-muted ring-1 ring-line font-medium",
    dotColor: "bg-ink-muted",
  },
};

export function SupportStatusBadge({ status, size = "md", className }: SupportStatusBadgeProps): ReactElement {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    tone: "bg-paper-deep text-ink ring-1 ring-line",
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full transition-colors",
        sizeClasses,
        config.tone,
        className,
      )}
    >
      {config.dotColor ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            config.dotColor,
            status === "waiting_on_you" ? "animate-pulse" : "",
          )}
          aria-hidden="true"
        />
      ) : null}
      <span>{config.label}</span>
    </span>
  );
}

const CATEGORY_TONES: Record<SupportCategory, string> = {
  bug: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20",
  billing: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  feature: "bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/20",
  support: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20",
  website_change: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/20",
  account_access: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20",
  general: "bg-paper-deep text-ink-soft ring-1 ring-line",
  other: "bg-paper-deep text-ink-soft ring-1 ring-line",
};

export function SupportCategoryBadge({
  category,
  className,
}: {
  readonly category: SupportCategory;
  readonly className?: string;
}): ReactElement {
  const tone = CATEGORY_TONES[category] ?? "bg-paper-deep text-ink-soft ring-1 ring-line";
  const label = SUPPORT_CATEGORY_LABELS[category] ?? category;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
