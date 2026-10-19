import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/**
 * The two marks the website shows beside a business's name, drawn the same way here so staff see what a visitor will:
 * Verified is a marigold scalloped seal with a brown tick, Trusted an indigo shield with a tick (website
 * components/local/verified.tsx). The colours are the website's, not the console's, on purpose.
 */

/** A 12-lobe scalloped rosette on a 32px grid, computed once. Same shape as the website's seal. */
const SEAL_PATH = (() => {
  const points: string[] = [];
  const steps = 96;
  for (let step = 0; step <= steps; step += 1) {
    const angle = (2 * Math.PI * step) / steps;
    const radius = 13 + 1.3 * Math.cos(12 * angle);
    points.push(`${(16 + radius * Math.cos(angle)).toFixed(2)} ${(16 + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
})();

interface MarkProps {
  readonly className?: string;
}

export function VerifiedMark({ className }: MarkProps): ReactElement {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn("size-5 shrink-0", className)}>
      <path d={SEAL_PATH} fill="#f3b54a" stroke="#b9760f" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 16.4l4.2 4.2 7.8-9.2" fill="none" stroke="#3d2204" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrustedMark({ className }: MarkProps): ReactElement {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={cn("size-5 shrink-0", className)}>
      <path d="M16 2.5 28 7v8.5C28 22.2 23 27.4 16 29.5 9 27.4 4 22.2 4 15.5V7Z" fill="#e3e9f6" stroke="#27407a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16 8.2 22.4 10.6v5c0 3.8-2.7 6.8-6.4 8.2-3.7-1.4-6.4-4.4-6.4-8.2v-5Z" fill="#27407a" />
      <path d="M10 15.8l4.2 4.2 7.8-9.2" fill="none" stroke="#fbf6f2" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface TagChipsProps {
  /** Always true on a verified business; kept explicit so a caller can show Trusted alone. */
  readonly verified: boolean;
  readonly trusted: boolean;
  readonly className?: string;
}

/** "Verified" and, when staff granted it, "Trusted", each with its website mark. */
export function TagChips({ verified, trusted, className }: TagChipsProps): ReactElement {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium", className)}>
      {verified ? (
        <span className="inline-flex items-center gap-1.5">
          <VerifiedMark />
          Verified
        </span>
      ) : null}
      {trusted ? (
        <span className="inline-flex items-center gap-1.5">
          <TrustedMark />
          Trusted
        </span>
      ) : null}
    </span>
  );
}
