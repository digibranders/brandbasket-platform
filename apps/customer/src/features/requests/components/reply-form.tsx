"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import type { ActionFailure } from "@/lib/action-result";
import { Banner, Button, Field, Textarea, useToast } from "@/ui";
import { replyAction } from "../actions";
import { handleImagePaste } from "../paste";
import { Screenshots, type ScreenshotsHandle } from "./screenshots";

export interface ReplyFormProps {
  readonly ticketId: string;
  /** "Send reply", or "Ask for a fix" while the change waits to be checked: a reply then goes back to the team as a fix. */
  readonly sendLabel: string;
}

/** The reply box. A fresh key after every send makes a double press one reply, and remounts the form, which empties it. */
export function ReplyForm({ ticketId, sendLabel }: ReplyFormProps) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [ids, setIds] = useState<readonly string[]>([]);
  const screenshots = useRef<ScreenshotsHandle>(null);
  const [uploading, setUploading] = useState(false);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    start(async () => {
      const result = await replyAction(null, formData);
      if (!result.ok) {
        setFailure(result);
        return;
      }
      setFailure(null);
      toast("Reply sent.");
      setIds([]);
      setSubmissionKey(crypto.randomUUID());
    });
  };

  return (
    <form key={submissionKey} onSubmit={onSubmit} onPaste={(event) => handleImagePaste(event, (files) => screenshots.current?.addFiles(files), "screenshot")} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
      <Field label="Reply" name="body" error={failure?.fieldErrors?.body}>
        <Textarea name="body" required placeholder="Write a reply" />
      </Field>
      <Screenshots ref={screenshots} onIds={setIds} onBusy={setUploading} disabled={pending} resetKey={submissionKey} />
      <div className="flex justify-end">
        <Button type="submit" pending={pending} disabled={uploading}>
          {sendLabel}
        </Button>
      </div>
    </form>
  );
}
