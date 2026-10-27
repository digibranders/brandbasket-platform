"use client";

import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { STEP_FIELD_CLASSES } from "@/components/panel/step-form";
import { initialMoveDomainState, type MoveDomainState } from "@/lib/move-domain-state";

interface MoveDomainFormProps {
  readonly action: (previous: MoveDomainState, formData: FormData) => Promise<MoveDomainState>;
}

/** "I've got my own domain": the domain and the ownership tick, the same two things step 04 asks for. */
export function MoveDomainForm({ action }: MoveDomainFormProps): ReactElement {
  const [state, formAction] = useActionState(action, initialMoveDomainState);
  const error = state.status === "error" ? state : null;

  return (
    <form action={formAction} noValidate className="space-y-5">
      <div>
        <label htmlFor="move-domain" className="block text-sm font-semibold">
          Your domain
          <RequiredMark />
        </label>
        <input
          id="move-domain"
          name="domain"
          type="text"
          required
          maxLength={300}
          autoComplete="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourbusiness.com"
          aria-invalid={error?.field === "domain" ? true : undefined}
          aria-describedby="move-domain-hint"
          className={STEP_FIELD_CLASSES}
        />
        <p id="move-domain-hint" className="mt-1.5 text-[0.8125rem] text-ink-2">
          Paste it however you have it. We only need the name, for example yourbusiness.com.
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="ownerConfirmed"
          required
          aria-invalid={error?.field === "ownerConfirmed" ? true : undefined}
          className="mt-1 size-4 shrink-0 accent-accent"
        />
        <span>
          I own this domain, or I can get into the account it’s registered with.
          <RequiredMark />
        </span>
      </label>

      {error === null ? null : (
        <p role="alert" className="rounded-lg bg-rattan-wash px-4 py-3 text-sm text-rattan-ink">
          {error.message}
        </p>
      )}

      <SubmitButton pendingLabel="Sending…" className={DARK_BUTTON_SHAPE}>
        Send to our team
      </SubmitButton>
    </form>
  );
}
