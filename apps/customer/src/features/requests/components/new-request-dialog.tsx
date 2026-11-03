"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { useRef, useState, useTransition, type FormEvent } from "react";
import type { ActionFailure } from "@/lib/action-result";
import { Banner, Button, Chips, DialogClose, Dialog, Field, Input, Textarea, useToast } from "@/ui";
import { sendRequestAction } from "../actions";
import { PAGE_FIELD_LIMIT, type IntentOption, type RequestIntent } from "../rules";
import { handleImagePaste } from "../paste";
import { Screenshots, type ScreenshotsHandle } from "./screenshots";

const FORM_ID = "new-request-form";

/** The parameters that open the dialog and start it filled in; all of them leave the address when it closes. */
const PARAMS = {
  new: parseAsString,
  intent: parseAsString,
  kind: parseAsString,
  page: parseAsString,
  from: parseAsString,
  about: parseAsString,
};

const CLEARED = { new: null, intent: null, kind: null, page: null, from: null, about: null } as const;

export interface NewRequestDialogProps {
  readonly options: readonly IntentOption[];
  readonly defaultIntent: RequestIntent | null;
  readonly defaultPage: string;
  /** What the box starts with when the dialog was opened from a post. */
  readonly defaultBody: string;
  readonly fromPreview: boolean;
  /** "This month: 1 of 2 included edits used.", or null. */
  readonly includedLine: string | null;
}

/**
 * New request, intent first: what it is about, which page, what we should do, screenshots. Opened by `?new=1` so the
 * header button, the sidebar and old links all open the same dialog. A key made when the dialog is filled in makes a
 * double press one request.
 */
export function NewRequestDialog({ options, defaultIntent, defaultPage, defaultBody, fromPreview, includedLine }: NewRequestDialogProps) {
  const [params, setParams] = useQueryStates(PARAMS);
  const toast = useToast();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const first = options[0]?.value ?? "";
  const [intent, setIntent] = useState<RequestIntent | "">(defaultIntent ?? first);
  const [ids, setIds] = useState<readonly string[]>([]);
  const screenshots = useRef<ScreenshotsHandle>(null);
  const [uploading, setUploading] = useState(false);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  const close = () => void setParams(CLEARED);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    start(async () => {
      const result = await sendRequestAction(null, formData);
      if (!result.ok) {
        setFailure(result);
        return;
      }
      setFailure(null);
      toast("Request sent. We reply within one working day.");
      setIntent(defaultIntent ?? first);
      setIds([]);
      setSubmissionKey(crypto.randomUUID());
      close();
    });
  };

  const fieldErrors = failure?.fieldErrors ?? {};
  const showsPage = intent === "website_update";

  return (
    <Dialog
      open={params.new === "1"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="New request"
      description={fromPreview ? "Your preview is waiting. Tell us what to change." : undefined}
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} variant="primary" pending={pending} disabled={uploading}>
            Send request
          </Button>
        </>
      }
    >
      <form key={submissionKey} id={FORM_ID} onSubmit={onSubmit} onPaste={(event) => handleImagePaste(event, (files) => screenshots.current?.addFiles(files), "screenshot")} className="flex flex-col gap-4">
        <input type="hidden" name="submissionKey" value={submissionKey} />
        <input type="hidden" name="intent" value={intent} />
        {ids.map((id) => (
          <input key={id} type="hidden" name="attachmentIds" value={id} />
        ))}
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        <Field label="What is it about?" nativeLabel={false} error={fieldErrors.intent}>
          <Chips aria-label="What is it about?" options={options.map((option) => ({ value: option.value, label: option.label }))} value={intent} onValueChange={(next) => setIntent(next as RequestIntent)} className="flex-wrap" />
        </Field>
        {showsPage ? (
          <Field label="Which page?" name="page" error={fieldErrors.page}>
            <Input name="page" defaultValue={defaultPage} maxLength={PAGE_FIELD_LIMIT} autoComplete="off" />
          </Field>
        ) : null}
        <Field label="What should we do?" name="body" error={fieldErrors.body}>
          <Textarea name="body" defaultValue={defaultBody} required placeholder="Say it the way you would tell a person." />
        </Field>
        <Screenshots ref={screenshots} onIds={setIds} onBusy={setUploading} disabled={pending} resetKey={submissionKey} />
        {showsPage && includedLine !== null ? <p className="type-meta">{includedLine} If your request is bigger, we send a price first.</p> : null}
      </form>
    </Dialog>
  );
}
