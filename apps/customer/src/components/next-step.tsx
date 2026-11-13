import type { ReactNode } from "react";
import { Icon, type IconName } from "@/ui";

export interface NextStepProps {
  /** "Waiting for you" when the next move is the customer's. */
  readonly title?: string;
  readonly icon?: IconName;
  /** What happens next, in a sentence or two. */
  readonly children: ReactNode;
  /** The page's primary action when it waits on the customer, and at most one secondary. */
  readonly actions?: ReactNode;
  /** Beside the actions: the price with GST, or the date the action unlocks. */
  readonly note?: ReactNode;
}

/** The accent box that says what happens next and holds the action that moves it (plan 60, NextStep). */
export function NextStep({ title = "Waiting for you", icon, children, actions, note }: NextStepProps) {
  return (
    <section className="flex flex-col gap-2.5 rounded-panel border border-accent-border bg-accent-wash p-4">
      <h2 className="flex items-center gap-2 type-sub text-ink">
        {icon === undefined ? null : <Icon name={icon} className="text-accent-text" />}
        {title}
      </h2>
      <div className="type-body text-ink-2">{children}</div>
      {actions === undefined && note === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {note === undefined ? null : <span className="type-meta">{note}</span>}
        </div>
      )}
    </section>
  );
}
