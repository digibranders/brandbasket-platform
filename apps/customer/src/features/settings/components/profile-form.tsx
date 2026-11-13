"use client";

import { saveProfileAction } from "../actions";
import { NAME_MAX_LENGTH } from "../rules/account-settings-form";
import { Banner, Button, Field, Input, useToast } from "@/ui";
import { useActionForm } from "./use-action-form";

export interface ProfileFormProps {
  readonly name: string;
  /** Null for an account that signs in with a mobile number: its stored address is a placeholder nobody reads. */
  readonly email: string | null;
  /** The mobile number as it is read on screen, or null. */
  readonly mobile: string | null;
  readonly role: string;
  readonly supportEmail: string;
}

/** Settings, Profile: the name is the person's to change; the address and number are how they sign in, so they are shown, not edited. */
export function ProfileForm({ name, email, mobile, role, supportEmail }: ProfileFormProps) {
  const toast = useToast();
  const form = useActionForm(saveProfileAction, () => toast("Profile saved"));
  const signInHint = (
    <>
      It is what you sign in with. To change it, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
    </>
  );
  return (
    <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
      {form.failure === null ? null : <Banner tone="neg">{form.failure.message}</Banner>}
      <div className="grid max-w-160 gap-4 md:grid-cols-2">
        <Field label="Full name" name="name" error={form.errorOf("name")}>
          <Input name="name" defaultValue={name} required autoComplete="name" maxLength={NAME_MAX_LENGTH} />
        </Field>
        <Field label="Your role">
          <Input value={role} readOnly />
        </Field>
        {email === null ? null : (
          <Field label="Email" hint={signInHint}>
            <Input value={email} readOnly type="email" />
          </Field>
        )}
        {mobile === null ? null : (
          <Field label="Mobile" hint={signInHint}>
            <Input value={mobile} readOnly type="tel" />
          </Field>
        )}
      </div>
      <div>
        <Button type="submit" variant="primary" pending={form.pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
