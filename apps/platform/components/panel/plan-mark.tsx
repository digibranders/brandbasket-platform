import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { HeartIcon } from "@brandbasket/shared/ui/icons";
import type { MembershipTier } from "@/lib/membership";

/** The plan's mark: the heart, in the accent colour, or cream on a dark ground (`onDark`). */
export function PlanMark({ className, onDark = false }: { readonly tier: MembershipTier; readonly className?: string; readonly onDark?: boolean }): ReactElement {
  return <HeartIcon className={cn(onDark ? "text-paper" : "text-accent", className)} />;
}
