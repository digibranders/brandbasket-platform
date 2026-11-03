"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@brandbasket/auth/password-policy";
import { useState } from "react";
import { PasswordInput } from "@/features/entry/components/password-input";
import { Banner, Button, Field, useToast } from "@/ui";
import { changePasswordAction } from "../actions";
import { SignOutOtherDevices } from "./sign-out-other-devices";
import { useActionForm } from "./use-action-form";

/** Change password. A success keeps this device signed in and signs the others out; if that second step fails the form says so and offers it again. */
export function ChangePasswordForm() {
  const toast = useToast();
  const [partial, setPartial] = useState(false);
  const form = useActionForm(changePasswordAction, (data, element) => {
    element.reset();
    if (data?.otherDevicesSignedOut === false) setPartial(true);
    else {
      setPartial(false);
      toast("Password updated");
    }
  });
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
        {form.failure === null ? null : <Banner tone="neg">{form.failure.message}</Banner>}
        <div className="grid max-w-160 gap-4 md:grid-cols-2">
          <Field label="Current password" name="currentPassword" error={form.errorOf("currentPassword")} className="md:col-span-2">
            <PasswordInput name="currentPassword" required autoComplete="current-password" maxLength={PASSWORD_MAX_LENGTH} />
          </Field>
          <Field label="New password" name="newPassword" hint={PASSWORD_RULE} error={form.errorOf("newPassword")}>
            <PasswordInput name="newPassword" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          </Field>
          <Field label="Confirm new password" name="confirmPassword" error={form.errorOf("confirmPassword")}>
            <PasswordInput name="confirmPassword" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" pending={form.pending}>
            Update password
          </Button>
        </div>
      </form>
      {partial ? (
        <Banner tone="warn" action={<SignOutOtherDevices label="Try again" size="sm" onDone={() => setPartial(false)} />}>
          Your password is changed, but your other devices are still signed in.
        </Banner>
      ) : null}
    </div>
  );
}
