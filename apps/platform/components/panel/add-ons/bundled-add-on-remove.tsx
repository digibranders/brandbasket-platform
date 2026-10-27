"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
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
  const websiteOfflineId = useId();
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
      <button ref={openerRef} type="button" className={SOFT_BUTTON} aria-label={`Remove ${title}`} onClick={() => setAsking(true)}>
        Remove
      </button>
    );
  }

  return (
    <div className="max-w-sm space-y-3">
      <div role="group" aria-labelledby={questionId} className="space-y-1.5 text-sm">
        <p id={questionId} ref={questionRef} tabIndex={-1} className="text-ink outline-none">
          Remove {title}? It stays until {endsOn}, then stops.
        </p>
        <p id={keepsId} className="tabular-nums text-ink-2">
          {copy.keeps}
        </p>
        <p id={monthlyId} className="tabular-nums text-ink-2">
          {copy.monthly}
        </p>
        {copy.websiteOffline === null ? null : (
          <p id={websiteOfflineId} className="text-ink">
            {copy.websiteOffline}
          </p>
        )}
        {copy.packageEnds === null ? null : (
          <p id={packageEndsId} className="text-ink">
            {copy.packageEnds}
          </p>
        )}
      </div>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="addOn" value={addOn} />
        {controls.saved ? null : (
          <>
            <button
              type="submit"
              className={`${SOFT_BUTTON} text-error! disabled:opacity-55`}
              disabled={controls.isPending}
              aria-busy={controls.isPending}
              aria-describedby={[keepsId, monthlyId, copy.websiteOffline === null ? null : websiteOfflineId, copy.packageEnds === null ? null : packageEndsId]
                .filter((id) => id !== null)
                .join(" ")}
              aria-label={controls.isPending ? `Removing ${title}` : `Yes, remove ${title}`}
            >
              {controls.isPending ? "Removing…" : "Yes, remove"}
            </button>
            <button
              type="button"
              className="text-[0.8125rem] font-semibold text-ink-2 underline underline-offset-[3px] transition-colors duration-200 hover:text-ink disabled:opacity-55"
              disabled={controls.isPending}
              aria-label={`Keep it: don't remove ${title}`}
              onClick={() => {
                returnFocus.current = true;
                setAsking(false);
              }}
            >
              Keep it
            </button>
          </>
        )}
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText={`${title} stops on ${endsOn}.`} />
      </form>
    </div>
  );
}
