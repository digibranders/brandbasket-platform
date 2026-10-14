import type { ReactElement } from "react";
import { LocalDate } from "@fynix/shared/ui/panel/local-date-time";
import type { AttentionKind } from "@/lib/pipeline";

interface AttentionReasonProps {
  readonly kind: AttentionKind;
  readonly reason: string;
  /** ISO timestamp: the deadline for a due preview, or when a lead came in. */
  readonly at: string | null;
  /**
   * Beside a status line, "New" would only repeat it, so a new lead says when it came in instead. On its own (the
   * focus strip) "New" is the useful word.
   */
  readonly besideStatus?: boolean;
}

/** "Preview due" needs its date, in the reader's own zone; every other reason is complete as written. */
export function AttentionReason({ kind, reason, at, besideStatus = false }: AttentionReasonProps): ReactElement {
  if (kind === "new-lead" && besideStatus && at !== null) {
    return (
      <>
        Came in on <LocalDate iso={at} />
      </>
    );
  }
  if (kind !== "due" || at === null) return <>{reason}</>;
  return (
    <>
      {reason} <LocalDate iso={at} />
    </>
  );
}
