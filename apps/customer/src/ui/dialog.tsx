"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode, RefObject } from "react";
import { cx } from "./cx";
import { IconButton } from "./icon-button";

export interface DialogProps {
  /** The button that opens it. Leave out for a dialog opened from state (open and onOpenChange). */
  readonly trigger?: ReactElement<Record<string, unknown>>;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** The decision or the short form. */
  readonly children: ReactNode;
  /** The actions, right aligned: one primary, the rest secondary or ghost. */
  readonly footer?: ReactNode;
  /** The close button's accessible name. */
  readonly closeLabel?: string;
  /** The element that takes focus on open. Defaults to the first one that can (the close button). */
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

/** One decision or a short form, 560px wide. Focus is trapped, Escape closes and focus returns to the trigger. */
export function Dialog({ trigger, open, onOpenChange, title, description, children, footer, closeLabel = "Close", initialFocus }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      {trigger === undefined ? null : <BaseDialog.Trigger render={trigger} />}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="motion-fade fixed inset-0 z-40 bg-scrim" />
        <BaseDialog.Popup
          {...(initialFocus === undefined ? {} : { initialFocus })}
          className="motion-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-overlay bg-surface shadow-dialog outline-none"
        >
          <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
            <div className="min-w-0 flex-1">
              <BaseDialog.Title className="type-section">{title}</BaseDialog.Title>
              {description === undefined ? null : <BaseDialog.Description className="mt-0.5 type-meta">{description}</BaseDialog.Description>}
            </div>
            <BaseDialog.Close render={<IconButton icon="X" label={closeLabel} tooltip={false} />} />
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
          {footer === undefined ? null : (
            <div className="flex justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3">{footer}</div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** A button that closes the dialog it sits in, such as Cancel. */
export function DialogClose({ children }: { readonly children: ReactElement<Record<string, unknown>> }) {
  return <BaseDialog.Close render={children} />;
}

export interface SheetProps extends Omit<DialogProps, "footer"> {
  readonly footer?: ReactNode;
  readonly className?: string;
}

/**
 * The inspector: a record's detail in a right panel on desktop (440px, with a scrim) and a bottom sheet at 92% height on
 * phones (plan 60, Sheet).
 */
export function Sheet({ trigger, open, onOpenChange, title, description, children, footer, closeLabel = "Close", className }: SheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      {trigger === undefined ? null : <BaseDialog.Trigger render={trigger} />}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="motion-fade fixed inset-0 z-40 bg-scrim" />
        <BaseDialog.Popup
          className={cx(
            "motion-sheet fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col rounded-t-overlay bg-surface shadow-inspector outline-none md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-inspector md:max-w-full md:rounded-none",
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-border-subtle px-4 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <BaseDialog.Title className="type-section">{title}</BaseDialog.Title>
              {description === undefined ? null : <BaseDialog.Description className="mt-0.5 type-meta">{description}</BaseDialog.Description>}
            </div>
            <BaseDialog.Close render={<IconButton icon="X" label={closeLabel} tooltip={false} />} />
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{children}</div>
          {footer === undefined ? null : <div className="flex gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
