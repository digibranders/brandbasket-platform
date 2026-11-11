"use client";

import { Button } from "@/ui";

export interface SaveBarProps {
  /** The form has changes that are not saved. The bar shows only then. */
  readonly dirty: boolean;
  /** The id of the form the Save button submits. */
  readonly formId: string;
  readonly onDiscard: () => void;
  readonly pending?: boolean;
  readonly saveLabel?: string;
}

/**
 * Discard and Save for a settings-style form, fixed to the bottom of the page from the first edit (plan 60, SaveBar). On
 * phones it sits above the tab bar.
 */
export function SaveBar({ dirty, formId, onDiscard, pending = false, saveLabel = "Save changes" }: SaveBarProps) {
  if (!dirty) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="fixed inset-x-0 bottom-15 z-30 flex h-save-bar items-center justify-end gap-3 border-t border-border bg-surface px-gutter md:bottom-0 md:left-sidebar"
    >
      <span className="mr-auto type-meta md:mr-0">You have unsaved changes</span>
      <Button onClick={onDiscard} disabled={pending}>
        Discard
      </Button>
      <Button type="submit" form={formId} variant="primary" pending={pending}>
        {saveLabel}
      </Button>
    </div>
  );
}
