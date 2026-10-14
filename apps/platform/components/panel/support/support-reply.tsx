"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@firstfold/shared/ui/panel/button";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { FIELD_CLASSES } from "@/components/panel/form/panel-form";
import { replyToSupportRequest } from "@/app/app-host/(support)/support/actions";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";
import { handleImagePaste } from "@/lib/support-paste";
import { SupportAttachments, type SupportAttachmentsHandle } from "./support-attachments";

export function SupportReply({ ticketId, submissionKey }: { readonly ticketId: string; readonly submissionKey: string }): ReactElement {
  const [sent, setSent] = useState(false);
  const [key, setKey] = useState(submissionKey);
  const onSent = useCallback(() => setSent(true), []);
  return sent ? (
    <div className="mt-6">
      <p role="status" className="text-sm text-ink-soft">
        Reply sent.
      </p>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="mt-3 cursor-pointer"
        onClick={() => {
          setKey(crypto.randomUUID());
          setSent(false);
        }}
      >
        Write another reply
      </Button>
    </div>
  ) : (
    <SupportReplyForm key={key} ticketId={ticketId} submissionKey={key} onSent={onSent} />
  );
}

function SupportReplyForm({
  ticketId,
  submissionKey,
  onSent,
}: {
  readonly ticketId: string;
  readonly submissionKey: string;
  readonly onSent: () => void;
}): ReactElement {
  const [state, action, pending] = useActionState(replyToSupportRequest, INITIAL_SUPPORT_STATE);
  const [body, setBody] = useState("");
  const [ids, setIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachmentsRef = useRef<SupportAttachmentsHandle>(null);
  const router = useRouter();
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "idle") status.current?.focus();
    if (state.status === "saved") {
      onSent();
      router.refresh();
    }
  }, [state, router, onSent]);

  // The one paste handler, on the form: a paste inside the text box bubbles up to it.
  const handlePaste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachmentsRef.current?.addFiles(files), "screenshot");
  }, []);

  return (
    <form action={action} onPaste={handlePaste} className="mt-8 space-y-4 border-t border-line pt-6">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <label className="block text-sm font-medium">
        Your reply
        <RequiredMark />
        <textarea
          name="body"
          value={body}
          onChange={(event) => {
            // The server trims the reply and refuses it blank, which `required` alone lets spaces through.
            event.target.setCustomValidity(event.target.value.trim() === "" ? "Write a reply." : "");
            setBody(event.target.value);
          }}
          required
          maxLength={5000}
          rows={4}
          disabled={pending}
          placeholder="Type your reply, or paste screenshots here."
          className={FIELD_CLASSES}
        />
      </label>
      <SupportAttachments ref={attachmentsRef} onChange={setIds} onBusy={setUploading} disabled={pending} />
      <p ref={status} tabIndex={-1} role="status" aria-live="polite" className="text-sm text-accent-deep outline-none">
        {state.message}
      </p>
      <SubmitButton size="sm" disabled={uploading}>
        {pending ? "Sending…" : "Send reply"}
      </SubmitButton>
    </form>
  );
}
