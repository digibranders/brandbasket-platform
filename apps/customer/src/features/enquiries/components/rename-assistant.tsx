"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button, Dialog, DialogClose, Field, Input, useToast } from "@/ui";
import { renameChatbotAction } from "../actions";
import { CHATBOT_NAME_MAX } from "../rules";

/** The assistant's name is the customer's own label for it. A refusal is said in a sentence under the box. */
export function RenameAssistant({ chatbotId, name }: { readonly chatbotId: string; readonly name: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [state, action, pending] = useActionState(async (previous: ActionResult | null, formData: FormData): Promise<ActionResult> => {
    const result = await renameChatbotAction(previous, formData);
    if (result.ok) {
      setOpen(false);
      toast("Name saved");
    }
    return result;
  }, null);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" aria-label={`Rename ${name}`}>
          Rename
        </Button>
      }
      title="Rename your assistant"
      footer={
        <>
          <DialogClose>
            <Button disabled={pending}>Cancel</Button>
          </DialogClose>
          <Button type="submit" form={`rename-${chatbotId}`} variant="primary" pending={pending}>
            Save name
          </Button>
        </>
      }
    >
      <form id={`rename-${chatbotId}`} action={action} className="flex flex-col gap-4">
        <input type="hidden" name="chatbotId" value={chatbotId} />
        <Field label="Assistant name" name="name" error={state?.ok === false ? (state.fieldErrors?.name ?? state.message) : undefined}>
          <Input name="name" defaultValue={name} maxLength={CHATBOT_NAME_MAX} required autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}
