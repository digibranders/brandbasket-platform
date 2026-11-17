"use client";

import { useToast } from "@brandbasket/shared/ui/patterns";
import { useCallback, useState } from "react";
import { closeTicketAction, reopenTicketAction, restoreTicketStatusAction } from "@/app/(protected)/support/status-actions";

export interface RequestStatusControls {
  /** The id being changed, for the busy state of its button. */
  readonly busyId: string | null;
  readonly close: (ticketId: string) => Promise<boolean>;
  readonly reopen: (ticketId: string) => Promise<boolean>;
}

/**
 * Close and reopen change the status only and email nobody, so each shows a toast with Undo instead of asking first. A failure
 * is an error toast that stays until dismissed.
 */
export function useRequestStatus(onChanged: () => void): RequestStatusControls {
  const { show } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = useCallback(
    async (ticketId: string, act: () => ReturnType<typeof closeTicketAction>, copy: { readonly done: string; readonly undone: string; readonly back: (previous: string) => string }): Promise<boolean> => {
      setBusyId(ticketId);
      try {
        const result = await act();
        if (!result.ok) {
          show({ message: result.message, tone: "error" });
          return false;
        }
        show({
          message: copy.done,
          undoneMessage: copy.undone,
          undo: async () => {
            const undone = await restoreTicketStatusAction(ticketId, copy.back(result.previous));
            if (!undone.ok) throw new Error(undone.message);
            onChanged();
          },
        });
        onChanged();
        return true;
      } catch {
        show({ message: "The change did not save. Nothing was changed.", tone: "error" });
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [onChanged, show],
  );

  const close = useCallback((ticketId: string) => run(ticketId, () => closeTicketAction(ticketId), { done: "Request closed. No email was sent.", undone: "Request reopened", back: (previous) => previous }), [run]);
  const reopen = useCallback((ticketId: string) => run(ticketId, () => reopenTicketAction(ticketId), { done: "Request reopened. No email was sent.", undone: "Request closed again", back: () => "resolved" }), [run]);

  return { busyId, close, reopen };
}
