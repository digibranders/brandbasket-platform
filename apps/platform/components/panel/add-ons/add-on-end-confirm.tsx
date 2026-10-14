"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { ADD_ONS_PATH } from "@fynix/shared/lib/billing/add-ons";
import { Button } from "@fynix/shared/ui/panel/button";
import type { AddOnEndKind } from "@fynix/shared/lib/billing/add-on-state";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { addOnActionLabel, endConfirmQuestion, endPendingLabel, endSavedText } from "@/lib/billing/add-on-copy";

interface AddOnEndConfirmProps {
  /** The row Pause and Cancel act on. Only this id goes in the form; the server reads everything else. */
  readonly addOnSubscriptionId: string;
  readonly title: string;
  /** The end date as the page says it ("12 November 2026"), worked out on the server. */
  readonly endsOn: string;
  /** The id of the add-on's heading. Focus goes there when the action has gone through. */
  readonly headingId: string;
  readonly action: PanelFormAction;
}

/** Cancel reads as the weightier button: the same shape, in the error colour, as DESIGN.md asks for destructive text actions. */
const DESTRUCTIVE = "text-accent-deep! hover:bg-accent-pale!";

/**
 * Pause and Cancel for one add-on, with the confirm step in the page itself (never a modal, DESIGN.md): pressing either
 * turns the pair into one sentence saying what will happen, with "Yes, ..." and "Keep it". The server decides whether
 * the add-on can be ended; a refusal shows beside the buttons and keeps the question open. When it goes through the
 * page is redrawn with the add-on's new state, which removes these buttons, so focus is placed on the add-on's
 * heading first and the result is announced by the state line there. A payment notice left in the address ("Done.
 * Local SEO carries on...") would now contradict the page, so a successful Pause or Cancel also clears it.
 *
 * Focus follows the question: pressing Pause or Cancel moves it to the sentence (the button it was on has gone), and
 * "Keep it" puts it back on the button that opened the question. While the request runs, the button's accessible name
 * says what is happening.
 */
export function AddOnEndConfirm({ addOnSubscriptionId, title, endsOn, headingId, action }: AddOnEndConfirmProps): ReactElement {
  const router = useRouter();
  const [asking, setAsking] = useState<AddOnEndKind | null>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  // The button the question was opened from, set when "Keep it" closes it so focus can go back once the buttons are drawn.
  const returnFocusTo = useRef<AddOnEndKind | null>(null);
  const focusHeadingAfter: PanelFormAction = async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "saved") {
      document.getElementById(headingId)?.focus();
      if (window.location.search !== "") router.replace(ADD_ONS_PATH, { scroll: false });
    }
    return next;
  };
  const { formRef, statusRef, formAction, controls } = usePanelForm(focusHeadingAfter);

  useEffect(() => {
    if (asking !== null) {
      questionRef.current?.focus();
      return;
    }
    const opener = returnFocusTo.current;
    returnFocusTo.current = null;
    if (opener !== null) buttonsRef.current?.querySelector<HTMLButtonElement>(`[data-opens="${opener}"]`)?.focus();
  }, [asking]);

  if (asking === null) {
    const pause = addOnActionLabel("pause", title);
    const cancel = addOnActionLabel("cancel", title);
    return (
      <div ref={buttonsRef} className="flex flex-wrap gap-3 sm:justify-end">
        <Button type="button" variant="secondary" size="sm" data-opens="pause" aria-label={pause.ariaLabel} onClick={() => setAsking("pause")}>
          {pause.text}
        </Button>
        <Button type="button" variant="secondary" size="sm" data-opens="cancel" aria-label={cancel.ariaLabel} onClick={() => setAsking("cancel")}>
          {cancel.text}
        </Button>
      </div>
    );
  }

  const yes = asking === "cancel" ? "Yes, cancel" : "Yes, pause";
  const pending = endPendingLabel(asking, title);
  return (
    <div className="max-w-xs space-y-3 sm:text-right">
      <p ref={questionRef} tabIndex={-1} className="text-sm text-ink outline-none">{endConfirmQuestion(asking, title, endsOn)}</p>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3 sm:justify-end">
        <input type="hidden" name="addOnSubscriptionId" value={addOnSubscriptionId} />
        <input type="hidden" name="kind" value={asking} />
        {controls.saved ? null : (
          <>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className={asking === "cancel" ? DESTRUCTIVE : undefined}
              disabled={controls.isPending}
              aria-busy={controls.isPending}
              aria-label={controls.isPending ? pending.ariaLabel : `${yes} ${title}`}
            >
              {controls.isPending ? pending.text : yes}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={controls.isPending}
              aria-label={`Keep it: don't ${asking} ${title}`}
              onClick={() => {
                returnFocusTo.current = asking;
                setAsking(null);
              }}
            >
              Keep it
            </Button>
          </>
        )}
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText={endSavedText(asking, title, endsOn)} />
      </form>
    </div>
  );
}
