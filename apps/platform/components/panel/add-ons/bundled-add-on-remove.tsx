"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import type { DropCopy } from "@/lib/billing/drop-service";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface BundledAddOnRemoveProps {
  /** The add-on's catalogue id. Only this goes in the form; the server reads everything else. */
  readonly addOn: string;
  readonly title: string;
  /** The next billing date as the page says it ("12 November 2026"), worked out on the server: when it would stop. */
  readonly endsOn: string;
  /** What the confirm step says it leaves behind: the services kept, the new monthly payment and what a package loses. */
  readonly copy: DropCopy;
  /** The id of the add-on's heading. Focus goes there when the action has gone through. */
  readonly headingId: string;
  readonly action: PanelFormAction;
}

/**
 * Remove for an add-on taken with the plan, with the confirm step in the page itself (never a modal, DESIGN.md): pressing it
 * turns the button into what will happen (when it stops, the services that stay, the new monthly payment, and what a package
 * loses), with "Yes, remove" and "Keep it". It stops at the next billing date, so it stays paid for until then. When it goes
 * through the page is redrawn with the add-on ending, which removes this control, so focus is placed on the add-on's heading
 * first and the result is announced by the state line there. The confirm text is one group named by its question, and "Yes,
 * remove" is described by the sentences under it, so a screen reader hears the whole consequence on reaching the button.
 */
export function BundledAddOnRemove({ addOn, title, endsOn, copy, headingId, action }: BundledAddOnRemoveProps): ReactElement {
  const [asking, setAsking] = useState(false);
  const questionId = useId();
  const keepsId = useId();
  const monthlyId = useId();
  const packageEndsId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const focusHeadingAfter: PanelFormAction = async (previous, formData) => {
    const next = await action(previous, formData);
    if (next.status === "saved") document.getElementById(headingId)?.focus();
    return next;
  };
  const { formRef, statusRef, formAction, controls } = usePanelForm(focusHeadingAfter);

  useEffect(() => {
    if (asking) {
      questionRef.current?.focus();
      return;
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      openerRef.current?.focus();
    }
  }, [asking]);

  if (!asking) {
    return (
      <Button ref={openerRef} type="button" variant="secondary" size="sm" aria-label={`Remove ${title}`} onClick={() => setAsking(true)}>
        Remove
      </Button>
    );
  }

  return (
    <div className="max-w-sm space-y-3 sm:text-right">
      <div role="group" aria-labelledby={questionId} className="space-y-1.5 text-sm">
        <p id={questionId} ref={questionRef} tabIndex={-1} className="text-ink outline-none">
          Remove {title}? It stays until {endsOn}, then stops.
        </p>
        <p id={keepsId} className="tabular-nums text-ink-soft">
          {copy.keeps}
        </p>
        <p id={monthlyId} className="tabular-nums text-ink-soft">
          {copy.monthly}
        </p>
        {copy.packageEnds === null ? null : (
          <p id={packageEndsId} className="text-ink">
            {copy.packageEnds}
          </p>
        )}
      </div>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3 sm:justify-end">
        <input type="hidden" name="addOn" value={addOn} />
        {controls.saved ? null : (
          <>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="text-accent-deep! hover:bg-accent-pale!"
              disabled={controls.isPending}
              aria-busy={controls.isPending}
              aria-describedby={copy.packageEnds === null ? `${keepsId} ${monthlyId}` : `${keepsId} ${monthlyId} ${packageEndsId}`}
              aria-label={controls.isPending ? `Removing ${title}` : `Yes, remove ${title}`}
            >
              {controls.isPending ? "Removing…" : "Yes, remove"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={controls.isPending}
              aria-label={`Keep it: don't remove ${title}`}
              onClick={() => {
                returnFocus.current = true;
                setAsking(false);
              }}
            >
              Keep it
            </Button>
          </>
        )}
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText={`${title} stops on ${endsOn}.`} />
      </form>
    </div>
  );
}
