"use client";

import type { ChangeKind } from "@brandbasket/db/change-states";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type ClipboardEvent, type ReactElement } from "react";
import { askForChangeAction } from "@/app/app-host/(protected)/requests/actions";
import { SupportAttachments, type SupportAttachmentsHandle } from "@/components/panel/support/support-attachments";
import { DARK_BUTTON } from "@/components/v2/classes";
import { requestHref } from "@/lib/requests/links";
import { handleImagePaste } from "@/lib/support-paste";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-2/80 focus:border-ink";

interface AskFormProps {
  /** The kinds this customer can pick, in order (lib/requests/form.ts kindOptions). */
  readonly options: readonly { readonly value: ChangeKind; readonly label: string }[];
  /** A fresh key for this form, so sending it twice by accident makes one request. */
  readonly submissionKey: string;
  /** The kind to start on, from the link (lib/requests/form.ts readAskDefaults) or a post's Change link. The first option when left out. */
  readonly defaultKind?: ChangeKind | undefined;
  /** The page to fill in, from the link. Empty when left out. */
  readonly defaultPage?: string;
  /** What the box starts with (the line naming a post). */
  readonly defaultBody?: string | undefined;
}

/** The form behind "Ask for a change": what it is about, which page for a website change, what to change, up to 3 screenshots. */
export function AskForm({ options, submissionKey, defaultKind, defaultPage = "", defaultBody }: AskFormProps): ReactElement {
  const [state, action, pending] = useActionState(askForChangeAction, INITIAL_SUPPORT_STATE);
  const [kind, setKind] = useState<ChangeKind | undefined>(defaultKind ?? options[0]?.value);
  const [ids, setIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachments = useRef<SupportAttachmentsHandle>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "error") status.current?.focus();
    if (state.status === "saved" && state.ticketId !== null) router.push(requestHref(state.ticketId));
  }, [state, router]);

  const paste = useCallback((event: ClipboardEvent<HTMLFormElement>): void => {
    handleImagePaste(event, (files) => attachments.current?.addFiles(files), "screenshot");
  }, []);

  const bodyProblem = state.status === "error" && state.field === "body" ? state.message : null;
  return (
    <form action={action} onPaste={paste} className="grid gap-5">
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="attachmentIds" value={id} />
      ))}
      <fieldset className="grid gap-2" disabled={pending}>
        <legend className="text-[0.8125rem] font-semibold text-ink">What is it about?</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <label
              key={option.value}
              className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[0.8125rem] font-semibold text-ink shadow-[0_0_0_1px_var(--color-line)] transition-colors duration-200 has-[:checked]:bg-ink has-[:checked]:text-white has-[:checked]:shadow-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rattan"
            >
              <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="sr-only" />
              {option.label}
            </label>
          ))}
        </div>
        {state.status === "error" && state.field === "kind" ? (
          <p role="alert" className="text-xs font-semibold text-error">
            {state.message}
          </p>
        ) : null}
      </fieldset>
      {kind === "website" ? (
        <div>
          <label htmlFor="ask-page" className="block text-[0.8125rem] font-semibold text-ink">
            Which page? (optional)
          </label>
          <input id="ask-page" name="page" type="text" maxLength={200} defaultValue={defaultPage} disabled={pending} placeholder="For example Home or Services" className={INPUT} />
        </div>
      ) : null}
      <div>
        <label htmlFor="ask-body" className="block text-[0.8125rem] font-semibold text-ink">
          What do you want changed?
        </label>
        <textarea
          id="ask-body"
          name="body"
          required
          rows={6}
          defaultValue={defaultBody}
          maxLength={5000}
          disabled={pending}
          placeholder="Tell us what to change. A screenshot helps."
          aria-invalid={bodyProblem !== null}
          aria-describedby={bodyProblem === null ? undefined : "ask-body-error"}
          onChange={(event) => event.target.setCustomValidity(event.target.value.trim() === "" ? "Say what you want changed." : "")}
          className={INPUT}
        />
        {bodyProblem === null ? null : (
          <p id="ask-body-error" role="alert" className="mt-1 text-xs font-semibold text-error">
            {bodyProblem}
          </p>
        )}
      </div>
      <SupportAttachments ref={attachments} onChange={setIds} onBusy={setUploading} disabled={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || uploading} className={DARK_BUTTON}>
          {pending ? "Sending..." : "Send"}
        </button>
        <p ref={status} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} className="text-xs font-semibold text-error outline-none">
          {state.status === "error" && state.field !== "body" && state.field !== "kind" ? state.message : ""}
        </p>
      </div>
    </form>
  );
}
