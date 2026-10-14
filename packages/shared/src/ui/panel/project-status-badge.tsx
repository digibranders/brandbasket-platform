import type { ProjectStatus } from "@fynix/db";
import type { ReactElement } from "react";
import { cn } from "../../lib/cn";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES_WAITING_ON_US } from "../../lib/project-status";

/** Stages waiting on us are filled dark so they stand out in a list; finished or stopped ones recede. */
function toneFor(status: ProjectStatus): string {
  if (PROJECT_STATUSES_WAITING_ON_US.includes(status)) return "bg-ink text-paper";
  if (status === "live") return "bg-accent-pale text-accent-deep";
  if (status === "cancelled" || status === "on_hold") return "bg-transparent text-ink-soft ring-1 ring-line";
  return "bg-paper-deep text-ink";
}

export function ProjectStatusBadge({ status }: { readonly status: ProjectStatus }): ReactElement {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-sm", toneFor(status))}>
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
