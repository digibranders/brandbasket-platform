"use client";

import { useActionState, useState, type ReactElement } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { Button } from "@fynix/shared/ui/panel/button";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { NOMINEE_NAME_MAX_LENGTH, NOMINEE_PHONE_MAX_LENGTH, initialNomineeState, type NomineeFormState } from "@/lib/privacy-settings-form";

interface NomineeFormProps {
  readonly save: (state: NomineeFormState, formData: FormData) => Promise<NomineeFormState>;
  readonly clear: () => Promise<NomineeFormState>;
  /** The nominee named now, shown in the fields; null when there is none. */
  readonly current: { readonly name: string; readonly phoneText: string } | null;
}

const ERROR_ID = "nominee-error";
const INPUT_CLASSES =
  "mt-2 block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent aria-[invalid=true]:border-accent-deep";

/** Settings, Privacy: the person named to use these rights for you if you die or cannot act (DPDP Act s.14). */
export function NomineeForm({ save, clear, current }: NomineeFormProps): ReactElement {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [state, formAction, isPending] = useActionState(async (previous: NomineeFormState, data: FormData) => {
    setNoticeDismissed(false);
    return save(previous, data);
  }, initialNomineeState);
  const [clearState, clearAction, isClearing] = useActionState(async () => {
    setNoticeDismissed(false);
    return clear();
  }, initialNomineeState);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField = state.status === "error" ? state.field : null;
  const invalid = (field: "name" | "phone"): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } =>
    errorMessage !== null && errorField === field ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {};
  const cleared = clearState.status === "cleared" && !isClearing;

  return (
    <div className="max-w-md space-y-5">
      <form
        // Keyed on what was named, so the fields show the saved nominee, or empty ones once it is taken off.
        key={`${current?.name ?? ""}|${current?.phoneText ?? ""}|${cleared ? "cleared" : ""}`}
        action={formAction}
        onInput={() => setNoticeDismissed(true)}
        noValidate
        aria-busy={isPending}
        className="space-y-5"
      >
        <div>
          <label htmlFor="nominee-name" className="block text-sm font-medium">
            Their name
            <RequiredMark />
          </label>
          <RuleInput
            id="nominee-name"
            name="name"
            rule="personName"
            required
            autoComplete="off"
            maxLength={NOMINEE_NAME_MAX_LENGTH}
            defaultValue={cleared ? "" : (current?.name ?? "")}
            className={INPUT_CLASSES}
            {...invalid("name")}
          />
        </div>
        <div>
          <label htmlFor="nominee-phone" className="block text-sm font-medium">
            Their phone number
            <RequiredMark />
          </label>
          <RuleInput
            id="nominee-phone"
            name="phone"
            rule="phone"
            type="tel"
            required
            autoComplete="off"
            maxLength={NOMINEE_PHONE_MAX_LENGTH}
            placeholder="98200 00000"
            defaultValue={cleared ? "" : (current?.phoneText ?? "")}
            className={`${INPUT_CLASSES} tabular-nums`}
            {...invalid("phone")}
          />
        </div>
        <p className="text-sm text-ink-soft">
          If you die or cannot act for yourself, this person can ask us to show, correct or delete your data. We keep only this name and number, for this
          purpose, and delete them with your account.
        </p>

        {errorMessage === null ? null : (
          <p id={ERROR_ID} role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            {errorMessage}
          </p>
        )}
        {state.status === "saved" && !isPending && !noticeDismissed ? (
          <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            Saved.
          </p>
        ) : null}
        {cleared && !noticeDismissed ? (
          <p role="status" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            Your nominee is removed.
          </p>
        ) : null}

        <SubmitButton disabled={isPending}>
          {isPending ? "Saving…" : current === null || cleared ? "Name this person" : "Save changes"}
        </SubmitButton>
      </form>

      {current !== null && !cleared ? (
        <form action={clearAction} aria-busy={isClearing}>
          <Button type="submit" variant="secondary" size="sm" disabled={isClearing || isPending} aria-busy={isClearing}>
            {isClearing ? "Removing…" : "Remove my nominee"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
