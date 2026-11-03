"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, Dialog, Field, LinkButton, Textarea } from "@/ui";
import { approvePreviewAction, sendPreviewFeedbackAction } from "../actions";
import { ASK_FOR_CHANGE_HREF } from "../rules/paths";

export interface PreviewDecisionProps {
  /** "Two rounds of changes are included." or "Further changes are quoted first." */
  readonly roundsLine: string;
  readonly roundsUsedUp: boolean;
  /** A fresh key per page render, so a double press sends one ticket. */
  readonly feedbackKey: string;
  /** Viewers read the preview but cannot answer it. */
  readonly canAnswer: boolean;
}

const FEEDBACK_FORM_ID = "preview-feedback";

/** Approve, with an in-page confirm (never a modal, as before), and the question it asks moved into focus. */
function Approve() {
  const [asking, setAsking] = useState(false);
  const [state, approve, pending] = useActionState(async (): Promise<ActionResult> => approvePreviewAction(), null);
  const question = useRef<HTMLParagraphElement>(null);
  const questionId = useId();

  useEffect(() => {
    if (asking) question.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <Button variant="primary" icon="CheckCircle" onClick={() => setAsking(true)}>
        Approve and go live
      </Button>
    );
  }
  return (
    <div role="group" aria-labelledby={questionId} className="flex w-full flex-col gap-3">
      <p id={questionId} ref={question} tabIndex={-1} className="type-body text-ink outline-none">
        Approve this preview? We will then start getting it live.
      </p>
      {state !== null && !state.ok ? <Banner tone="neg">{state.message}</Banner> : null}
      <form action={approve} className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          Yes, approve
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
          Keep reviewing
        </Button>
      </form>
    </div>
  );
}

/** Ask for changes: what to change, sent as the next round. The text stays in the box when sending fails. */
function AskForChanges({ roundsLine, feedbackKey }: { readonly roundsLine: string; readonly feedbackKey: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [state, send, pending] = useActionState(sendPreviewFeedbackAction, null);
  const failure = state !== null && !state.ok ? state : null;
  const bodyError = failure?.fieldErrors?.body;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button>Ask for changes</Button>}
      title="Ask for changes"
      description={roundsLine}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={FEEDBACK_FORM_ID} variant="primary" pending={pending}>
            Send changes
          </Button>
        </>
      }
    >
      <form id={FEEDBACK_FORM_ID} action={send} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="submissionKey" value={feedbackKey} />
        <Field label="What should we change?" name="body" {...(bodyError === undefined ? {} : { error: bodyError })}>
          <Textarea name="body" rows={6} maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Say which page and what to change." />
        </Field>
        {failure !== null && bodyError === undefined ? <Banner tone="neg">{failure.message}</Banner> : null}
      </form>
    </Dialog>
  );
}

/** "What do you think?": approve the preview or send what to change, with the rounds that are left. */
export function PreviewDecision({ roundsLine, roundsUsedUp, feedbackKey, canAnswer }: PreviewDecisionProps) {
  return (
    <div className="flex flex-col gap-3">
      {canAnswer ? (
        <div className="flex flex-wrap items-start gap-2">
          <Approve />
          {roundsUsedUp ? <LinkButton href={ASK_FOR_CHANGE_HREF}>Ask for a change</LinkButton> : <AskForChanges roundsLine={roundsLine} feedbackKey={feedbackKey} />}
        </div>
      ) : null}
      <p className="type-meta">{roundsLine}</p>
    </div>
  );
}
