"use client";

import type { ReactElement } from "react";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";
import { DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { EMAIL_MAX_LENGTH, ROLE_OPTIONS } from "@/lib/team/rules";

/** Settings, Team: invite someone by email as an editor or a viewer. The email field empties once the invitation is sent. */
export function InviteForm({ action }: { readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form
      // Keyed on the saved state, so the fields start empty again after an invitation goes out.
      key={controls.saved ? "sent" : "new"}
      ref={formRef}
      action={formAction}
      noValidate
      aria-busy={controls.isPending}
      className="grid max-w-xl gap-5"
    >
      <div>
        <label htmlFor="invite-email" className="block text-[0.9375rem] font-semibold text-ink">
          Email address
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={EMAIL_MAX_LENGTH}
          required
          defaultValue={controls.valueOf("email", "")}
          className={FIELD_CLASSES}
          {...controls.fieldStatus("email")}
        />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-[0.9375rem] font-semibold text-ink">
          Role
        </label>
        <select id="invite-role" name="role" required defaultValue={controls.valueOf("role", "editor")} className={FIELD_CLASSES} {...controls.fieldStatus("role")}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Sending…" className={DARK_BUTTON_SHAPE}>
          Send invitation
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} savedText="Invitation sent." />
      </div>
    </form>
  );
}
