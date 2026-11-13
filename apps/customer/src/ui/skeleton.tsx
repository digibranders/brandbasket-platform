import { cx } from "./cx";

/**
 * A placeholder shaped like the content it stands for. It pulses, never shimmers. Size it with width and height classes;
 * the region it fills carries aria-busy, not the skeleton.
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden className={cx("h-3.5 rounded-mark bg-neutral-wash motion-pulse", className)} />;
}
