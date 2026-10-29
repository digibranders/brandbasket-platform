"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { sendPreviewFeedbackAction } from "@/app/app-host/(protected)/website/actions";
import { SupportAttachments, type SupportAttachmentsHandle } from "@/components/panel/support/support-attachments";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { handleImagePaste } from "@/lib/support-paste";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";

const INPUT = "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-2/80 focus:border-ink";

/**
 * "Ask for changes" under a preview: the button opens a box for what to change, with up to three screenshots, right on the
 * page. Sending it moves the project to Revisions and tells the team; it is not a request for a maintenance change.
 */
export function PreviewFeedback({ submissionKey, roundsLine }: { readonly submissionKey: string; readonly roundsLine: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(sendPreviewFeedbackAction, INITIAL_SUPPORT_STATE);
  const [ids, setIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachments = useRef<SupportAttachmentsHandle>(null);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === "error" && state.field === "body") body.current?.focus();
  }, [state]);

  const paste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachments.current?.addFiles(files), "screenshot");
  }, []);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(SOFT_BUTTON, "w-full")}>
        Ask for changes
      </button>
    );
  }
  const problem = state.status === "error" ? state.message : null;
  return (
    <form action={action} onPaste={paste} noValidate className="grid gap-4 border-t border-line pt-4">
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <div>
        <label htmlFor="feedback-body" className="block text-[0.9375rem] font-semibold text-ink">
          What should we change?
        </label>
        <textarea
          id="feedback-body"
          ref={body}
          name="body"
          required
          rows={5}
          maxLength={5000}
          disabled={pending}
          placeholder="Say which page and what to change. A screenshot helps."
          aria-invalid={problem !== null}
          aria-describedby={problem === null ? "feedback-rounds" : "feedback-problem feedback-rounds"}
          className={INPUT}
        />
        <p id="feedback-rounds" className="mt-1.5 text-[0.8125rem] text-ink-2">
          {roundsLine}
        </p>
      </div>
      <SupportAttachments ref={attachments} onChange={setIds} onBusy={setUploading} disabled={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || uploading} className={DARK_BUTTON}>
          {pending ? "Sending..." : "Send changes"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="text-[0.9375rem] font-semibold text-ink underline underline-offset-[3px]">
          Cancel
        </button>
        <p id="feedback-problem" role={problem === null ? "status" : "alert"} className="text-[0.8125rem] font-semibold text-error">
          {problem ?? ""}
        </p>
      </div>
    </form>
  );
}
