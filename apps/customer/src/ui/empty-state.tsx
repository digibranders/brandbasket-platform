import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export interface EmptyStateProps {
  readonly icon: IconName;
  /** Why it is empty, in one sentence. Never "No data". */
  readonly title: ReactNode;
  /** What will appear here, and when. */
  readonly description: ReactNode;
  /** At most one action. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <span className="mb-1 inline-flex size-9 items-center justify-center rounded-full bg-neutral-wash text-ink-3">
        <Icon name={icon} />
      </span>
      <h3 className="type-sub text-ink">{title}</h3>
      <p className="max-w-reading type-body text-ink-3">{description}</p>
      {action}
    </div>
  );
}
