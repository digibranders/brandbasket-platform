"use client";

import { useState, useTransition } from "react";
import { Banner, Button, Dialog, DialogClose, Field, Input, PhoneInput, useToast } from "@/ui";
import { clearNomineeAction, saveNomineeAction } from "../actions";
import { NOMINEE_NAME_MAX_LENGTH, NOMINEE_PHONE_MAX_LENGTH } from "../rules/nominee";
import { useActionForm } from "./use-action-form";

export interface NomineeDialogProps {
  /** The nominee named now; null when there is none. */
  readonly current: { readonly name: string; readonly phoneText: string } | null;
}

const FORM_ID = "nominee-form";

/** The person named to use these rights for you if you die or cannot act (DPDP Act s.14). Name and number; nothing is ever sent to them. */
export function NomineeDialog({ current }: NomineeDialogProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const form = useActionForm(saveNomineeAction, () => {
    setOpen(false);
    toast("Nominee saved");
  });

  function remove(): void {
    setRemoveMessage(null);
    startRemoving(async () => {
      const result = await clearNomineeAction();
      if (result.ok) {
        setOpen(false);
        toast("Nominee removed");
      } else {
        setRemoveMessage(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.clear();
          setRemoveMessage(null);
        }
      }}
      trigger={<Button size="sm">{current === null ? "Add nominee" : "Change nominee"}</Button>}
      title="Nominee"
      description="If you die or cannot act for yourself, this person can ask us to show, correct or delete your data. We keep only this name and number, for this purpose, and delete them with your account."
      footer={
        <>
          {current === null ? null : (
            <Button variant="danger" pending={removing} onClick={remove}>
              Remove nominee
            </Button>
          )}
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} variant="primary" pending={form.pending}>
            Save
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={form.submit} noValidate className="flex flex-col gap-4">
        {form.failure === null && removeMessage === null ? null : <Banner tone="neg">{form.failure?.message ?? removeMessage}</Banner>}
        <Field label="Their name" name="name" error={form.errorOf("name")}>
          <Input name="name" required autoComplete="off" maxLength={NOMINEE_NAME_MAX_LENGTH} defaultValue={current?.name ?? ""} />
        </Field>
        <Field label="Their phone number" name="phone" error={form.errorOf("phone")}>
          <PhoneInput name="phone" required autoComplete="off" maxLength={NOMINEE_PHONE_MAX_LENGTH} defaultValue={current?.phoneText ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}
