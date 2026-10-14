import Image from "next/image";
import type { ReactElement } from "react";
import { cn } from "@fynix/shared/lib/cn";

/** "Asha Rao" → "AR"; one name gives one letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part !== "");
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => part?.charAt(0).toUpperCase() ?? "").join("") || "?";
}

/** An author's photo, or their initials on the soft burgundy tint when they have none. */
export function AuthorAvatar({
  name,
  photoUrl,
  size = 36,
  className,
}: {
  readonly name: string;
  readonly photoUrl: string | null;
  readonly size?: number;
  readonly className?: string;
}): ReactElement {
  if (photoUrl !== null) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 rounded-full bg-paper-deep object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full bg-accent-pale font-medium text-accent-deep", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  );
}
