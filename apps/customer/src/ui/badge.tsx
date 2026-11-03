import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export type BadgeTone = "neutral" | "pos" | "neg" | "warn" | "info" | "accent";

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-neutral-wash text-neutral-text",
  pos: "bg-pos-wash text-pos-text",
  neg: "bg-neg-wash text-neg-text",
  warn: "bg-warn-wash text-warn-text",
  info: "bg-info-wash text-info-text",
  accent: "bg-accent-wash text-accent-text",
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly icon?: IconName;
  /** Always a word: colour never carries meaning alone. */
  readonly children: ReactNode;
  readonly className?: string;
}

/** A status word on a tint, no border, optional 14px icon (plan 60, Badge). */
export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  return (
    <span className={cx("inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-badge px-2 type-label", TONES[tone], className)}>
      {icon === undefined ? null : <Icon name={icon} size="sm" className="size-3.5" />}
      {children}
    </span>
  );
}
