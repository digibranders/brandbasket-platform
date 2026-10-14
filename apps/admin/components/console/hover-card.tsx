import type { ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import type { JourneySubject } from "@/lib/pipeline";
import { AttentionReason } from "./attention-reason";

interface HoverCardProps {
  readonly subject: JourneySubject;
  /** Which side of the avatar the card opens on; the last band opens left so it stays on the page. */
  readonly side: "left" | "right";
  /** Opens upwards for avatars low on the map, so the card never runs into the dock. */
  readonly above: boolean;
}

/**
 * A glance at one client without leaving the map. Pure CSS: it appears while its avatar (the `group`) is hovered or
 * holds keyboard focus, and carries no controls of its own, because the avatar itself is the link.
 */
export function HoverCard({ subject, side, above }: HoverCardProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "glass glass-dense pointer-events-none absolute z-30 w-60 rounded-2xl px-4 py-3.5 text-left opacity-0 shadow-[0_24px_50px_-20px_rgba(42,13,16,0.6)] transition-[opacity,translate] duration-300 ease-calm",
        "translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100",
        side === "right" ? "left-[calc(100%+0.9rem)]" : "right-[calc(100%+0.9rem)]",
        above ? "bottom-0" : "top-0",
      )}
    >
      <span className="block font-serif text-lg leading-tight">{subject.name}</span>
      <span className="mt-1 block text-sm text-paper/70">{subject.statusLabel}</span>
      {subject.attention === null ? null : (
        <span className="mt-2 block text-sm font-semibold text-gold">
          <AttentionReason
            kind={subject.attention.kind}
            reason={subject.attention.reason}
            at={subject.attention.at?.toISOString() ?? null}
            besideStatus
          />
        </span>
      )}
      <span className="mt-3 block text-xs font-semibold text-paper/60">Open ›</span>
    </span>
  );
}
