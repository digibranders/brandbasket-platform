"use client";

import type { ChangeEvent, ReactElement } from "react";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { OWNER_REPLY_MAX_LENGTH, OWNER_REPLY_MISSING_MESSAGE } from "@/lib/owner-replies";

/**
 * A reply must hold more than spaces and line breaks, which the browser's `required` lets through but the server
 * (parseOwnerReplyText) refuses. A custom validity makes the form's submit button wait for real words.
 */
function requireWords(event: ChangeEvent<HTMLTextAreaElement>): void {
  event.currentTarget.setCustomValidity(event.currentTarget.value.trim() === "" ? OWNER_REPLY_MISSING_MESSAGE : "");
}

/** The mark beside the owner's own words, drawn like the one on the business's public page: a small outlined check and one quiet word, no badge. */
export function OwnerTag(): ReactElement {
  return (
    <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-accent">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.4 2.8 2.8L16 9.8" />
      </svg>
      <span>Owner</span>
    </span>
  );
}

interface PostReplyFormProps {
  readonly reviewId: string;
  readonly action: PanelFormAction;
  /** No answer yet: the box is open. Otherwise it waits behind "Reply again". */
  readonly first: boolean;
}

/**
 * Answers a review. The box is a plain (uncontrolled) one: React puts it back to empty once the answer is saved, and a
 * refused one is drawn again as typed (usePanelForm's `valueOf`), so nothing the owner wrote is lost to an error.
 */
export function PostReplyForm({ reviewId, action, first }: PostReplyFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const label = `Your reply to review ${reviewId}`;
  const form = (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <label htmlFor={reviewId} className="sr-only">
        {label}
      </label>
      <textarea
        id={reviewId}
        name="text"
        rows={3}
        required
        maxLength={OWNER_REPLY_MAX_LENGTH}
        defaultValue={controls.valueOf("text", "")}
        onChange={requireWords}
        placeholder={first ? "Thank them, or answer what they said *" : "Add to your reply *"}
        className={FIELD_CLASSES}
        {...controls.fieldStatus("text")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText="Replied." />
        <SubmitButton size="sm" pendingLabel="Replying…">
          Reply
        </SubmitButton>
      </div>
    </form>
  );
  if (first) return form;
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-semibold text-accent marker:content-none group-open:mb-3">Reply again</summary>
      {form}
    </details>
  );
}

interface OwnerReplyControlsProps {
  readonly commentId: string;
  readonly text: string;
  readonly editAction: PanelFormAction;
  readonly removeAction: PanelFormAction;
}

const SUMMARY = "cursor-pointer marker:content-none";

function EditForm({ commentId, text, action }: { readonly commentId: string; readonly text: string; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="commentId" value={commentId} />
      <label htmlFor={`edit-${commentId}`} className="sr-only">
        Edit your reply
      </label>
      <textarea
        id={`edit-${commentId}`}
        name="text"
        rows={3}
        required
        maxLength={OWNER_REPLY_MAX_LENGTH}
        defaultValue={controls.valueOf("text", text)}
        onChange={requireWords}
        placeholder="Your reply *"
        className={FIELD_CLASSES}
        {...controls.fieldStatus("text")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText="Saved." />
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}

function RemoveForm({ commentId, action }: { readonly commentId: string; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="commentId" value={commentId} />
      <span className="text-sm text-ink-soft">Take this reply down?</span>
      <SubmitButton size="sm" pendingLabel="Removing…">
        Yes, remove
      </SubmitButton>
      <PanelFormStatus controls={controls} statusRef={statusRef} />
    </form>
  );
}

/**
 * Edit and Remove under the owner's own answer, each a plain disclosure: it opens where it is, and stays as the owner
 * left it while the page refreshes around a save. Remove asks once more before it takes the answer down.
 */
export function OwnerReplyControls({ commentId, text, editAction, removeAction }: OwnerReplyControlsProps): ReactElement {
  return (
    <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-1 text-sm">
      <details className="[&[open]]:basis-full">
        <summary className={`${SUMMARY} font-semibold text-accent hover:text-accent-deep`}>Edit</summary>
        <EditForm commentId={commentId} text={text} action={editAction} />
      </details>
      <details className="[&[open]]:basis-full">
        <summary className={`${SUMMARY} text-ink-soft hover:text-ink`}>Remove</summary>
        <RemoveForm commentId={commentId} action={removeAction} />
      </details>
    </div>
  );
}
