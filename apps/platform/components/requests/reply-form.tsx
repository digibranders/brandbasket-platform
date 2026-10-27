"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { replyToSupportRequest } from "@/app/app-host/(support)/support/actions";
import { SupportAttachments, type SupportAttachmentsHandle } from "@/components/panel/support/support-attachments";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { handleImagePaste } from "@/lib/support-paste";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";

const BOX =
  "block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-2/80 focus:border-ink";

interface ReplyFormProps {
  readonly ticketId: string;
  /** A fresh key for this reply, so sending twice by accident saves it once. */
  readonly submissionKey: string;
  /** "Send", or "Ask for a fix" while the change is waiting to be checked: a reply then goes back to the team as a fix. */
  readonly sendLabel: string;
}

function Fields({ ticketId, submissionKey, sendLabel, onSent }: ReplyFormProps & { readonly onSent: () => void }): ReactElement {
  const [state, action, pending] = useActionState(replyToSupportRequest, INITIAL_SUPPORT_STATE);
  const [ids, setIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachments = useRef<SupportAttachmentsHandle>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "error") status.current?.focus();
    if (state.status === "saved") {
      onSent();
      router.refresh();
    }
  }, [state, router, onSent]);

  const paste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachments.current?.addFiles(files), "screenshot");
  }, []);

  return (
    <form action={action} onPaste={paste} className="grid gap-3 border-t border-line px-5 py-3.5">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <label htmlFor="reply-body" className="sr-only">
        Write a reply
      </label>
      <textarea
        id="reply-body"
        name="body"
        required
        rows={3}
        maxLength={5000}
        disabled={pending}
        placeholder="Write a reply"
        aria-invalid={state.status === "error" && state.field === "body"}
        onChange={(event) => event.target.setCustomValidity(event.target.value.trim() === "" ? "Write a reply." : "")}
        className={BOX}
      />
      <SupportAttachments ref={attachments} onChange={setIds} onBusy={setUploading} disabled={pending} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || uploading} className={SOFT_BUTTON}>
          {pending ? "Sending..." : sendLabel}
        </button>
        <p ref={status} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="text-xs font-semibold text-error outline-none">
          {state.status === "error" ? state.message : ""}
        </p>
      </div>
    </form>
  );
}

/** The reply box under a conversation. After a reply is sent the box starts again, empty, with a new key. */
export function ReplyForm({ ticketId, submissionKey, sendLabel }: ReplyFormProps): ReactElement {
  const [key, setKey] = useState(submissionKey);
  const [sent, setSent] = useState(false);
  const onSent = useCallback(() => {
    setSent(true);
    setKey(crypto.randomUUID());
  }, []);
  return (
    <>
      {sent ? (
        <p role="status" className="border-t border-line px-5 pt-3 text-xs font-semibold text-sage-deep">
          Reply sent.
        </p>
      ) : null}
      <Fields key={key} ticketId={ticketId} submissionKey={key} sendLabel={sendLabel} onSent={onSent} />
    </>
  );
}
