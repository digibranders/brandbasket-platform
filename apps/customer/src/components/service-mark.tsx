import type { ServiceKey } from "@/ui";
import { cx } from "@/ui/cx";

const FILLED: Readonly<Record<ServiceKey, string>> = { website: "bg-svc-site", social: "bg-svc-social", search: "bg-svc-search" };
const OUTLINED: Readonly<Record<ServiceKey, string>> = { website: "border-svc-site", social: "border-svc-social", search: "border-svc-search" };

export interface ServiceMarkProps {
  readonly service: ServiceKey;
  /** A service not on the plan shows its mark as an outline. */
  readonly bought?: boolean;
  readonly className?: string;
}

/**
 * The service's small square on its own, for places where its name is already written beside it (the sidebar). Use
 * ServiceTag from @/ui for the mark with the name. Decorative: the name carries the meaning.
 */
export function ServiceMark({ service, bought = true, className }: ServiceMarkProps) {
  return <span aria-hidden className={cx("size-1.5 shrink-0 rounded-mark", bought ? FILLED[service] : cx("border", OUTLINED[service]), className)} />;
}
