import type { ReactElement } from "react";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";

interface PreviewReviewActionsProps {
  readonly approveAction: () => Promise<void>;
  readonly requestChangesAction: () => Promise<void>;
  /** The business's booking page. Null hides the "book a call" offer. */
  readonly calendlyUrl: string | null;
}

/**
 * How the customer responds to a preview: approve it outright, or ask for changes. There is deliberately no
 * text box here: any changes go through a call, not written notes, so "Request changes" is a plain action, same
 * shape as "Approve".
 */
export function PreviewReviewActions({
  approveAction,
  requestChangesAction,
  calendlyUrl,
}: PreviewReviewActionsProps): ReactElement {
  return (
    <div>
      <p className="text-sm leading-relaxed text-ink-soft">
        Take your time. A day or two to look it over is completely fine, there’s no rush. If anything needs to
        change, that happens on a call, not over text.
        {calendlyUrl === null ? null : (
          <>
            {" "}
            <a href={calendlyUrl} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
              Book a call
            </a>
            .
          </>
        )}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <form action={approveAction}>
          <SubmitButton size="sm" pendingLabel="Approving…">
            It’s perfect, approve
          </SubmitButton>
        </form>
        <form action={requestChangesAction}>
          <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">
            Request changes
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
