"use client";

import { useState, useTransition } from "react";
import { AlertDialog, Button, useToast } from "@/ui";
import { removeMemberAction } from "../actions";

/** Takes an editor or a viewer off the team, after a confirmation. The owner's row never shows it. */
export function RemoveMemberButton({ userId, name }: { readonly userId: string; readonly name: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startRemove] = useTransition();

  const remove = (): void => {
    setProblem(null);
    startRemove(async () => {
      const result = await removeMemberAction(userId).catch(() => ({ ok: false as const, message: "We could not do that. Try again in a moment." }));
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setOpen(false);
      toast(`${name} removed`);
    });
  };

  return (
    <AlertDialog
      trigger={
        <Button size="sm" aria-label={`Remove ${name}`}>
          Remove
        </Button>
      }
      open={open}
      onOpenChange={setOpen}
      title={`Remove ${name}?`}
      description={
        <>
          They will lose access to your dashboard straight away. You can invite them again later.
          {problem === null ? null : <span role="alert" className="mt-3 block text-neg-text">{problem}</span>}
        </>
      }
      cancelLabel="Cancel"
      action={
        <Button variant="danger" pending={pending} onClick={remove}>
          Remove
        </Button>
      }
    />
  );
}
