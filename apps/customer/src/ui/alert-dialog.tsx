"use client";

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./button";

export interface AlertDialogProps {
  readonly trigger?: ReactElement<Record<string, unknown>>;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: ReactNode;
  /** The consequence, in words: what happens, and from when. */
  readonly description: ReactNode;
  readonly cancelLabel: string;
  /** The confirming button, usually a danger Button. It closes the dialog itself when its action is done. */
  readonly action: ReactNode;
}

/** A destructive confirmation (plan 60, AlertDialog). Escape and Cancel back out; clicking outside does not. */
export function AlertDialog({ trigger, open, onOpenChange, title, description, cancelLabel, action }: AlertDialogProps) {
  return (
    <BaseAlertDialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      {trigger === undefined ? null : <BaseAlertDialog.Trigger render={trigger} />}
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="motion-fade fixed inset-0 z-40 bg-scrim" />
        <BaseAlertDialog.Popup className="motion-dialog fixed top-1/2 left-1/2 z-50 flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-overlay bg-surface shadow-dialog outline-none">
          <div className="flex flex-col gap-1.5 p-5">
            <BaseAlertDialog.Title className="type-section">{title}</BaseAlertDialog.Title>
            <BaseAlertDialog.Description className="type-body text-ink-2">{description}</BaseAlertDialog.Description>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3">
            <BaseAlertDialog.Close render={<Button>{cancelLabel}</Button>} />
            {action}
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
