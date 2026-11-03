"use client";

import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cx } from "./cx";

export interface AvatarProps {
  /** The person's or business's name: it names the avatar and gives the initials. */
  readonly name: string;
  readonly src?: string;
  /** A business is square with a primary fill; a person is round; a chip is a round white token that sits on grey. */
  readonly kind?: "person" | "business" | "chip";
  readonly size?: "sm" | "md";
  readonly className?: string;
}

/** Up to two initials from the first letters of the first two words. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({ name, src, kind = "person", size = "md", className }: AvatarProps) {
  return (
    <BaseAvatar.Root
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden type-label",
        size === "sm" ? "size-6" : "size-7",
        kind === "business"
          ? "rounded-chip bg-primary text-on-primary"
          : kind === "chip"
            ? "rounded-full bg-surface text-accent-text shadow-chip"
            : "rounded-full border border-border bg-neutral-wash text-ink-2",
        className,
      )}
    >
      {src === undefined ? null : <BaseAvatar.Image src={src} alt="" className="size-full object-cover" />}
      <BaseAvatar.Fallback aria-hidden>{initialsOf(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
