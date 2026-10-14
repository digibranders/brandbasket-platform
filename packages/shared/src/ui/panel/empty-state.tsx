import type { ReactElement, ReactNode } from "react";

interface EmptyStateProps {
  /** What is not here yet, as a short phrase: "No posts yet". */
  readonly title: string;
  /** Why it is empty and what to do about it. One or two sentences. */
  readonly body: ReactNode;
  /** The control that fills it, when there is something the customer can do from here. */
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
}

/**
 * What a list says when it has nothing in it.
 *
 * These were bare strings — "No posts yet." alone inside a bordered box, which reads as a screen that failed to
 * load rather than one waiting to be filled. An empty list is usually a customer's first sight of a feature, so it
 * says what goes here and offers the way in.
 */
export function EmptyState({ title, body, action, icon }: EmptyStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent-pale text-accent-deep"
        >
          {icon}
        </span>
      )}
      <p className="panel-section">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
      {action === undefined ? null : <div className="mt-6">{action}</div>}
    </div>
  );
}
