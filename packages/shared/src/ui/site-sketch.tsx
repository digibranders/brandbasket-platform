import type { CSSProperties, ReactElement } from "react";
import { cn } from "../lib/cn";

interface SiteSketchProps {
  readonly accent: string;
  readonly soft: string;
  /** Accessible description. Omit when the sketch is purely decorative. */
  readonly label?: string;
  readonly className?: string;
}

const REPEAT_THREE = [0, 1, 2] as const;

/** A hand-drawn-feeling wireframe of a small business website, tinted per project. */
export function SiteSketch({ accent, soft, label, className }: SiteSketchProps): ReactElement {
  const palette = { "--sketch-accent": accent, "--sketch-soft": soft } as CSSProperties;

  return (
    <div
      style={palette}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "overflow-hidden rounded-[1.5rem] border border-line bg-card shadow-[0_30px_60px_-42px_rgba(42,13,16,0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line/80 px-5 py-3.5">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-(--sketch-accent)" />
          <span className="h-2 w-14 rounded-full bg-ink/70" />
        </span>
        <span className="flex gap-2">
          {REPEAT_THREE.map((item) => (
            <span key={item} className="h-1.5 w-7 rounded-full bg-line" />
          ))}
        </span>
      </div>

      <div className="grid grid-cols-[1.15fr_1fr] gap-5 px-5 py-6">
        <div className="flex flex-col justify-center gap-2.5">
          <span className="h-3.5 w-11/12 rounded-full bg-ink/75" />
          <span className="h-3.5 w-8/12 rounded-full bg-ink/75" />
          <span className="mt-2 h-2 w-full rounded-full bg-line" />
          <span className="h-2 w-10/12 rounded-full bg-line" />
          <span className="mt-3 flex gap-2">
            <span className="h-6 w-20 rounded-full bg-(--sketch-accent)" />
            <span className="h-6 w-16 rounded-full border border-line" />
          </span>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-(--sketch-soft)">
          <span className="absolute -bottom-6 -right-6 size-24 rounded-full bg-(--sketch-accent) opacity-25" />
          <span className="absolute left-4 top-4 size-8 rounded-full border border-(--sketch-accent) opacity-60" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-line/80 px-5 py-5">
        {REPEAT_THREE.map((item) => (
          <div key={item} className="space-y-2">
            <span className="block aspect-[4/3] rounded-lg bg-(--sketch-soft)" />
            <span className="block h-1.5 w-3/4 rounded-full bg-line" />
            <span className="block h-1.5 w-1/2 rounded-full bg-line/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
