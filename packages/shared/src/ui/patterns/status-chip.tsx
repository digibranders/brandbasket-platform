import type { ReactElement } from "react";

export type StatusChipVariant = "active" | "next" | "waiting" | "idle" | "failed";

export interface StatusChipProps {
  readonly label: string;
  readonly variant?: StatusChipVariant;
  /** Whether to show a live status dot. Only shown for active live states. */
  readonly hasDot?: boolean;
  readonly className?: string;
}

const VARIANT_STYLES: Readonly<Record<StatusChipVariant, { container: string; dot: string }>> = {
  active: {
    container: "bg-pos-wash text-pos-text",
    dot: "bg-pos-text",
  },
  next: {
    container: "bg-accent-wash text-accent-text",
    dot: "bg-accent-gold",
  },
  waiting: {
    container: "bg-accent-wash text-accent-text",
    dot: "bg-accent-gold",
  },
  idle: {
    container: "bg-surface-hover text-ink-2",
    dot: "bg-ink-muted",
  },
  failed: {
    container: "bg-neg-wash text-neg-text",
    dot: "bg-neg-text",
  },
};

/**
 * StatusChip: 12px, full radius, 4px 12px padding per premium design language.
 * No dots unless the chip indicates a live status.
 */
export function StatusChip({
  label,
  variant = "idle",
  hasDot = false,
  className = "",
}: StatusChipProps): ReactElement {
  const styles = VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-semibold leading-none tracking-wide whitespace-nowrap ${styles.container} ${className}`}
    >
      {hasDot ? <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" /> : null}
      <span>{label}</span>
    </span>
  );
}
