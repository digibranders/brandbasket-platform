"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { replyToSupportRequest } from "@/app/app-host/(support)/support/actions";
import { SupportAttachments, type SupportAttachmentsHandle } from "@/components/panel/support/support-attachments";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { isSendShortcut, replyHeight } from "@/lib/reply-bar";
import { handleImagePaste } from "@/lib/support-paste";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";

/** One line tall (36px, the same as the Send button) until the text needs more; the height is set in `grow`. */
const BOX =
  "block h-9 min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border border-ink-2/65 bg-surface px-3.5 py-[7px] text-sm leading-5 text-ink placeholder:text-ink-2/80 focus:border-ink";

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

  const grow = useCallback((event: FormEvent<HTMLTextAreaElement>): void => {
    const field = event.currentTarget;
    field.style.height = "auto";
    field.style.height = `${replyHeight(field.scrollHeight)}px`;
  }, []);

  const sendOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!isSendShortcut(event) || pending || uploading) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const paste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachments.current?.addFiles(files), "screenshot");
  }, []);

  return (
    <form action={action} onPaste={paste} className="border-t border-line px-5 py-3.5">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <SupportAttachments compact ref={attachments} onChange={setIds} onBusy={setUploading} disabled={pending}>
        <label htmlFor="reply-body" className="sr-only">
          Write a reply
        </label>
        <textarea
          id="reply-body"
          name="body"
          required
          rows={1}
          maxLength={5000}
          disabled={pending}
          placeholder="Write a reply"
          aria-invalid={state.status === "error" && state.field === "body"}
          onChange={(event) => event.target.setCustomValidity(event.target.value.trim() === "" ? "Write a reply." : "")}
          onInput={grow}
          onKeyDown={sendOnShortcut}
          className={BOX}
        />
        <button type="submit" disabled={pending || uploading} className={`${SOFT_BUTTON} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}>
          {pending ? "Sending..." : sendLabel}
        </button>
      </SupportAttachments>
      <p ref={status} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="text-xs font-semibold text-error outline-none mt-2 empty:hidden">
        {state.status === "error" ? state.message : ""}
      </p>
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
