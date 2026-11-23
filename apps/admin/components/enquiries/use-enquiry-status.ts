"use client";

import { useToast } from "@brandbasket/shared/ui/patterns";
import { useCallback, useState } from "react";
import { markContactedAction, markLostAction, restoreEnquiryStatusAction } from "@/app/(protected)/leads/status-actions";

export interface EnquiryStatusControls {
  /** The id being changed, for the busy state of its button. */
  readonly busyId: string | null;
  readonly markContacted: (leadId: string, businessName: string) => Promise<boolean>;
  readonly markLost: (leadId: string, businessName: string) => Promise<boolean>;
}

/**
 * An enquiry's status changes email nobody (lead-updates sends no mail), so each shows a toast with Undo instead of asking
 * first. A failure is an error toast that stays until dismissed.
 */
export function useEnquiryStatus(onChanged: () => void): EnquiryStatusControls {
  const { show } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = useCallback(
    async (leadId: string, act: () => ReturnType<typeof markContactedAction>, doneMessage: string): Promise<boolean> => {
      setBusyId(leadId);
      try {
        const result = await act();
        if (!result.ok) {
          show({ message: result.message, tone: "error" });
          return false;
        }
        show({
          message: doneMessage,
          undoneMessage: "Status restored",
          undo: async () => {
            const undone = await restoreEnquiryStatusAction(leadId, result.previous);
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

  const markContacted = useCallback((leadId: string, businessName: string) => run(leadId, () => markContactedAction(leadId), `Marked ${businessName} contacted`), [run]);
  const markLost = useCallback((leadId: string, businessName: string) => run(leadId, () => markLostAction(leadId), `Marked ${businessName} lost`), [run]);

  return { busyId, markContacted, markLost };
}
