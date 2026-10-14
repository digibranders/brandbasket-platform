import type { ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { CrownIcon, HeartIcon } from "@firstfold/shared/ui/icons";
import type { MembershipTier } from "@/lib/membership";

/**
 * A plan's mark: the crown for Premium, in gold, and the heart for Care, in burgundy. `onDark` is for a burgundy ground,
 * where the crown is a brighter gold and the heart is cream.
 */
export function PlanMark({ tier, className, onDark = false }: { readonly tier: MembershipTier; readonly className?: string; readonly onDark?: boolean }): ReactElement {
  if (tier === "premium") return <CrownIcon className={cn(onDark ? "fill-gold/40 text-gold" : "fill-gold/45 text-gold-deep", className)} />;
  return <HeartIcon className={cn(onDark ? "text-paper" : "text-accent", className)} />;
}
