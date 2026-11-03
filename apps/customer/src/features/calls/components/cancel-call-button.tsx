"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertDialog, Button, useToast } from "@/ui";
import { cancelCallAction } from "../actions";

/** Cancel a call that has not started, after a confirmation. A call that is already gone counts as cancelled. */
export function CancelCallButton({ callId, when }: { readonly callId: string; readonly when: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startCancel] = useTransition();

  const cancel = (): void => {
    setProblem(null);
    startCancel(async () => {
      const result = await cancelCallAction(callId).catch(() => ({ ok: false as const, message: "We could not cancel that call. Please try again." }));
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setOpen(false);
      toast("Call cancelled");
      router.refresh();
    });
  };

  return (
    <AlertDialog
      trigger={
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
      }
      open={open}
      onOpenChange={setOpen}
      title="Cancel this call?"
      description={
        <>
          Your call on {when} will be cancelled and taken off our calendar.
          {problem === null ? null : <span role="alert" className="mt-3 block text-neg-text">{problem}</span>}
        </>
      }
      cancelLabel="Keep the call"
      action={
        <Button variant="danger" pending={pending} onClick={cancel}>
          Cancel the call
        </Button>
      }
    />
  );
}
