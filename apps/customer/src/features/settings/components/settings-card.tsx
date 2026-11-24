import type { ReactNode } from "react";
import { cx } from "@/ui/cx";

export type SettingsCardTone = "focal" | "danger" | "standard";

export interface SettingsCardProps {
  readonly title: ReactNode;
  /** One short line under the title. */
  readonly description?: ReactNode;
  /** The tab's one focal card is raised; the Delete account card gets a red top edge; the rest are quiet. */
  readonly tone?: SettingsCardTone;
  /** No padding around the children: for a table or rows that bring their own. */
  readonly flush?: boolean;
  /** At most one control beside the title. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

const FRAME: Readonly<Record<SettingsCardTone, string>> = {
  focal: "rounded-overlay shadow-hero",
  danger: "rounded-overlay border-t-2 border-t-neg-text shadow-hero",
  standard: "rounded-panel",
};

/** A settings block in the premium language: 14px card, or a 20px focal card. */
export function SettingsCard({ title, description, tone = "standard", flush = false, action, children }: SettingsCardProps) {
  return (
    <section className={cx("min-w-0 border border-border bg-surface", FRAME[tone])}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-5 sm:px-7 sm:pt-7">
        <div className="min-w-60 flex-1">
          <h2 className="type-section">{title}</h2>
          {description === undefined ? null : <p className="mt-1 type-meta">{description}</p>}
        </div>
        {action}
      </div>
      <div className={flush ? "mt-4" : "p-5 sm:p-7"}>{children}</div>
    </section>
  );
}
