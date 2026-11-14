import type { ReactElement } from "react";

export interface SkeletonProps {
  readonly className?: string;
  readonly width?: string | number;
  readonly height?: string | number;
  readonly rounded?: "control" | "card" | "hero" | "full";
}

/**
 * Skeleton: warm sunken block matching the final layout with a slow 1.6s pulse.
 * Motion automatically disabled under prefers-reduced-motion.
 */
export function Skeleton({
  className = "",
  width,
  height,
  rounded = "card",
}: SkeletonProps): ReactElement {
  const roundedClass =
    rounded === "control"
      ? "rounded-[8px]"
      : rounded === "card"
        ? "rounded-[14px]"
        : rounded === "hero"
          ? "rounded-[20px]"
          : "rounded-full";

  const style = {
    ...(width !== undefined ? { width: typeof width === "number" ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : {}),
  };

  return (
    <div
      aria-hidden="true"
      style={style}
      className={`bg-surface-hover motion-pulse ${roundedClass} ${className}`}
    />
  );
}
