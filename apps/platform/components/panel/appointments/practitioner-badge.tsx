import type { ReactElement } from "react";
import { practitionerInitials } from "@brandbasket/shared/lib/appointments/initials";
import { cn } from "@brandbasket/shared/lib/cn";

type BadgeTone = "accent" | "onAccent" | "muted";

const TONE_CLASSES: Readonly<Record<BadgeTone, string>> = {
  // On the page's own paper: the same pale-accent circle the Doctors page uses for a doctor without a photo.
  accent: "bg-accent-pale text-accent-deep",
  // Inside an accent-filled booking card, where the pale circle would disappear into the fill.
  onAccent: "bg-paper/25 text-paper",
  // Inside a done card's muted fill.
  muted: "bg-line text-ink-soft",
};

interface PractitionerBadgeProps {
  readonly name: string;
  readonly tone: BadgeTone;
  /** "sm" sits beside a patient's name on a booking card or list row; "md" heads a Today column. */
  readonly size: "sm" | "md";
}

/**
 * A doctor's initials in a small circle -- how a booking says which doctor it's with when the page is showing all
 * of them. Decorative (aria-hidden): every card and row that shows one already names the doctor in full in its own
 * aria-label, so a screen reader hears "with Dr Rahul Menon" once rather than "R M" and then the name again. The
 * `title` still gives a mouse user the full name on hover.
 *
 * Decorative to a screen reader but not to the eye: on a booking card the initials are the only visible sign of the
 * doctor, so they stay at the 11px floor (the small size was 9px) and are not letter-spaced.
 */
export function PractitionerBadge({ name, tone, size }: PractitionerBadgeProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[0.6875rem]" : "size-7 text-xs",
        TONE_CLASSES[tone],
      )}
    >
      {practitionerInitials(name)}
    </span>
  );
}
