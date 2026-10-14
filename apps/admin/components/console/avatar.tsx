import type { ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { avatarInitials, avatarTone } from "@/lib/avatar";
import type { AttentionKind } from "@/lib/pipeline";

/** A ring says why someone needs us without a word: burgundy for late work, gold for money. On dark glass the same
 * meanings take the family's light shades, since burgundy on ink is under 1.5:1. */
export type AvatarRing = "late" | "money";

export function ringFor(kind: AttentionKind | undefined): AvatarRing | null {
  // A new add-on purchase is money in too, so it takes the money ring: someone paid and is waiting to hear from us.
  if (kind === "payment" || kind === "add-on") return "money";
  if (kind === "overdue") return "late";
  return null;
}

const SIZES = {
  sm: "size-8 text-[0.6875rem]",
  md: "size-10 text-[0.8rem]",
  lg: "size-16 text-xl",
} as const;

type AvatarGround = "paper" | "glass";

/** Each ring on each ground, at least 3:1 against the gap beside it. */
const RINGS: Readonly<Record<AvatarGround, Readonly<Record<AvatarRing, string>>>> = {
  paper: { late: "ring-accent", money: "ring-gold-deep" },
  glass: { late: "ring-accent-pale", money: "ring-gold" },
};

/** The gap between avatar and ring is filled with whatever the avatar sits on. */
const RING_GROUNDS: Readonly<Record<AvatarGround, string>> = {
  paper: "ring-offset-paper",
  glass: "ring-offset-ink",
};

interface AvatarProps {
  /** The business or lead id: it picks the colour, so the same client looks the same everywhere. */
  readonly id: string;
  readonly name: string;
  readonly size?: keyof typeof SIZES;
  readonly ring?: AvatarRing | null;
  /** What the avatar sits on: cream paper (the default) or dark glass. */
  readonly ground?: AvatarGround;
  readonly className?: string;
}

/** Initials on a muted colour. Decorative: the name is always written beside it or named by its link. */
export function Avatar({ id, name, size = "md", ring = null, ground = "paper", className }: AvatarProps): ReactElement {
  const tone = avatarTone(id);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tone.background, color: tone.foreground }}
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-full font-semibold tracking-[0.02em]",
        SIZES[size],
        ring === null ? null : `ring-2 ring-offset-[3px] ${RINGS[ground][ring]} ${RING_GROUNDS[ground]}`,
        className,
      )}
    >
      {avatarInitials(name)}
    </span>
  );
}
