"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { askForChangeAction } from "@/app/app-host/(protected)/requests/actions";
import { SupportAttachments, type SupportAttachmentsHandle } from "@/components/panel/support/support-attachments";
import { DARK_BUTTON } from "@/components/v2/classes";
import { intentRule, type IntentOption, type RequestIntent } from "@/lib/requests/form";
import { requestHref } from "@/lib/requests/links";
import { handleImagePaste } from "@/lib/support-paste";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-2/80 focus:border-ink";

interface AskFormProps {
  /** The intents this customer can pick, in order (lib/requests/form.ts intentOptions). */
  readonly options: readonly IntentOption[];
  /** A fresh key for this form, so sending it twice by accident makes one request. */
  readonly submissionKey: string;
  /** The intent to start on, from the link (lib/requests/form.ts readAskDefaults) or a post's Change link. The first option when left out. */
  readonly defaultIntent?: RequestIntent | undefined;
  /** "This month: 1 of 2 included edits used.", shown only while a website change is chosen. */
  readonly includedLine?: string | null;
  /** The page to fill in, from the link. Empty when left out. */
  readonly defaultPage?: string;
  /** What the box starts with (the line naming a post). */
  readonly defaultBody?: string | undefined;
}

/** The form behind a new request: what they are trying to do, which page for a website change, the details, up to 3 screenshots. */
export function AskForm({ options, submissionKey, defaultIntent, includedLine = null, defaultPage = "", defaultBody }: AskFormProps): ReactElement {
  const [state, action, pending] = useActionState(askForChangeAction, INITIAL_SUPPORT_STATE);
  const [intent, setIntent] = useState<RequestIntent | undefined>(defaultIntent ?? options[0]?.value);
  const [ids, setIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachments = useRef<SupportAttachmentsHandle>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "error") (state.field === "body" ? body : status).current?.focus();
    if (state.status === "saved" && state.ticketId !== null) router.push(requestHref(state.ticketId));
  }, [state, router]);

  const paste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachments.current?.addFiles(files), "screenshot");
  }, []);

  const bodyProblem = state.status === "error" && state.field === "body" ? state.message : null;
  return (
    <form action={action} onPaste={paste} noValidate className="grid gap-5">
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <fieldset className="grid gap-3" disabled={pending}>
        <legend className="text-[0.9375rem] font-semibold text-ink">What would you like to do?</legend>
        <div className="grid gap-2 @xl:grid-cols-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex min-h-[3.5rem] cursor-pointer flex-col justify-center rounded-control border border-line bg-surface px-3.5 py-2.5 transition-colors duration-200 hover:bg-bg has-[:checked]:border-ink has-[:checked]:bg-bg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rattan"
            >
              <input type="radio" name="intent" value={option.value} checked={intent === option.value} onChange={() => setIntent(option.value)} className="sr-only" />
              <span className="text-[0.9375rem] font-semibold text-ink">{option.label}</span>
              <span className="text-[0.8125rem] text-ink-2">{option.hint}</span>
            </label>
          ))}
        </div>
        {state.status === "error" && state.field === "intent" ? (
          <p role="alert" className="text-[0.8125rem] font-semibold text-error">
            {state.message}
          </p>
        ) : null}
      </fieldset>
      {intent === "website_update" ? (
        <div>
          <label htmlFor="ask-page" className="block text-[0.9375rem] font-semibold text-ink">
            Which page? (optional)
          </label>
          <input id="ask-page" name="page" type="text" maxLength={200} defaultValue={defaultPage} disabled={pending} placeholder="For example Home or Services" className={INPUT} />
          {includedLine === null ? null : <p className="mt-1.5 text-[0.8125rem] text-ink-2">{includedLine}</p>}
        </div>
      ) : null}
      <div>
        <label htmlFor="ask-body" className="block text-[0.9375rem] font-semibold text-ink">
          {intent === undefined ? "Tell us more" : intentRule(intent).bodyLabel}
        </label>
        <textarea
          id="ask-body"
          ref={body}
          name="body"
          required
          rows={6}
          defaultValue={defaultBody}
          maxLength={5000}
          disabled={pending}
          placeholder={intent === undefined ? undefined : intentRule(intent).placeholder}
          aria-invalid={bodyProblem !== null}
          aria-describedby={bodyProblem === null ? undefined : "ask-body-error"}
          className={INPUT}
        />
        {bodyProblem === null ? null : (
          <p id="ask-body-error" role="alert" className="mt-1 text-[0.8125rem] font-semibold text-error">
            {bodyProblem}
          </p>
        )}
      </div>
      <SupportAttachments ref={attachments} onChange={setIds} onBusy={setUploading} disabled={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || uploading} className={DARK_BUTTON}>
          {pending ? "Sending..." : "Send"}
        </button>
        <p ref={status} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="text-[0.8125rem] font-semibold text-error outline-none">
          {state.status === "error" && state.field !== "body" && state.field !== "intent" ? state.message : ""}
        </p>
      </div>
    </form>
  );
}
