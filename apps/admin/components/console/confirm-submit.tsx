"use client";

import { useConfirmRun, type ConfirmCopy } from "@brandbasket/shared/ui/patterns";
import { useRef, type MouseEvent, type ReactElement } from "react";
import { useFormStatus } from "react-dom";

export interface ConfirmSubmitProps {
  /** Words of the confirm: title, one consequence line, the primary's name. The cancel is always "Keep". */
  readonly copy: ConfirmCopy;
  /** Classes of the button that opens the confirm and, once confirmed, submits the form it sits in. */
  readonly className: string;
  /** The button's words. */
  readonly children: string;
  /** Submit without the browser's own field checks, so the action answers with its notice (as the Send preview button always did). */
  readonly formNoValidate?: boolean;
}

/**
 * A submit button that asks first. It sits inside an ordinary form with its own action; pressing it (or Enter in a field)
 * opens the shared confirm, and only "confirm" submits the form, with this button as the submitter. The confirm is mounted
 * only while it is open, so the page holds just the button until then. The form's action and fields are not touched.
 */
export function ConfirmSubmit({ copy, className, children, formNoValidate }: ConfirmSubmitProps): ReactElement {
  const { request, dialog } = useConfirmRun();
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const ask = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const button = buttonRef.current;
    const form = button?.form;
    if (button === null || button === undefined || form === null || form === undefined) return;
    request(copy, () => form.requestSubmit(button));
  };

  return (
    <>
      <button ref={buttonRef} type="submit" formNoValidate={formNoValidate} disabled={pending} onClick={ask} className={className}>
        {children}
      </button>
      {dialog}
    </>
  );
}
