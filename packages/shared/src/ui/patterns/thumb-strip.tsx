import type { ReactElement, ReactNode } from "react";
import { StatusChip, type StatusChipVariant } from "./status-chip";

export interface ThumbItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly status: string;
  readonly statusVariant: StatusChipVariant;
  readonly mediaContent?: ReactNode;
  readonly needsAction?: boolean;
  readonly onClick?: () => void;
}

export interface ThumbStripProps {
  readonly items: readonly ThumbItem[];
  readonly className?: string;
}

/**
 * ThumbStrip: post picture strip (Social).
 * Square thumbnails with 12px radius, status ribbon under each, gold ring on action items.
 */
export function ThumbStrip({
  items,
  className = "",
}: ThumbStripProps): ReactElement {
  return (
    <div
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${className}`}
      role="list"
    >
      {items.map((item) => (
        <div
          key={item.id}
          onClick={item.onClick}
          role="listitem"
          className={`flex flex-col overflow-hidden rounded-[12px] border border-border bg-surface shadow-card transition-shadow ${
            item.needsAction ? "ring-2 ring-accent-gold" : ""
          } ${item.onClick ? "cursor-pointer hover:border-ink" : ""}`}
        >
          <div className="relative flex aspect-square w-full items-center justify-center bg-surface-hover text-ink-3">
            {item.mediaContent ? (
              item.mediaContent
            ) : (
              <svg className="h-8 w-8 fill-none stroke-current stroke-1.5" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-between p-2.5">
            <div>
              <b className="line-clamp-1 font-sans text-xs font-semibold text-ink">{item.title}</b>
              {item.subtitle ? (
                <span className="line-clamp-1 font-sans text-[11px] text-ink-3">{item.subtitle}</span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center">
              <StatusChip label={item.status} variant={item.statusVariant} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
