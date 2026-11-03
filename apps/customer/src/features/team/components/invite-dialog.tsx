"use client";

import { useState } from "react";
import { useActionForm } from "@/features/settings/components/use-action-form";
import { Banner, Button, Dialog, DialogClose, Field, Input, Select, useToast } from "@/ui";
import { inviteAction } from "../actions";
import { EMAIL_MAX_LENGTH, ROLE_OPTIONS } from "../rules";

const FORM_ID = "invite-form";

/** Invite someone as an Editor or a Viewer. The link goes to their email; the owner sees it under the people table until it is used. */
export function InviteDialog() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const form = useActionForm(inviteAction, (_data, element) => {
    element.reset();
    setOpen(false);
    toast("Invitation sent");
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.clear();
      }}
      trigger={
        <Button variant="primary" icon="Plus">
          Invite someone
        </Button>
      }
      title="Invite someone"
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID} variant="primary" pending={form.pending}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={form.submit} noValidate className="flex flex-col gap-4">
        {form.failure === null ? null : <Banner tone="neg">{form.failure.message}</Banner>}
        <Field label="Email" name="email" error={form.errorOf("email")}>
          <Input name="email" type="email" required autoComplete="off" placeholder="name@business.in" maxLength={EMAIL_MAX_LENGTH} />
        </Field>
        <Field label="Role" name="role" nativeLabel={false} hint="Editors can change the business profile and send requests. Viewers can only look." error={form.errorOf("role")}>
          <Select name="role" options={ROLE_OPTIONS} defaultValue="editor" />
        </Field>
      </form>
    </Dialog>
  );
}
