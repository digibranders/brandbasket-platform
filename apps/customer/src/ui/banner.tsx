import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export type BannerTone = "info" | "warn" | "neg" | "pos";

const TONES: Readonly<Record<BannerTone, { readonly box: string; readonly icon: string; readonly glyph: IconName }>> = {
  info: { box: "border-info-border bg-info-wash", icon: "text-info-text", glyph: "Info" },
  warn: { box: "border-warn-border bg-warn-wash", icon: "text-warn-text", glyph: "Warning" },
  neg: { box: "border-neg-border bg-neg-wash", icon: "text-neg-text", glyph: "WarningCircle" },
  pos: { box: "border-pos-border bg-pos-wash", icon: "text-pos-text", glyph: "CheckCircle" },
};

export interface BannerProps {
  readonly tone?: BannerTone;
  /** One sentence. A short bold lead is allowed. */
  readonly children: ReactNode;
  /** At most one action, usually a small Button or LinkButton. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/** An inline message with one action (plan 60, Banner). An error banner is announced at once. */
export function Banner({ tone = "info", children, action, className }: BannerProps) {
  const look = TONES[tone];
  return (
    <div role={tone === "neg" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-control border px-4 py-3 type-body text-ink", look.box, className)}>
      <Icon name={look.glyph} className={cx("mt-px", look.icon)} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
