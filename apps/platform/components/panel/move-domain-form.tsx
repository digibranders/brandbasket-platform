"use client";

import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
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
        <label htmlFor="move-domain" className="block text-sm font-medium">
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
        <p id="move-domain-hint" className="mt-1.5 text-sm text-ink-soft">
          Paste it however you have it. We only need the name, for example yourbusiness.com.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-control border border-line bg-paper/60 px-4 py-3">
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
        <p role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {error.message}
        </p>
      )}

      <SubmitButton pendingLabel="Sending…">Send to our team</SubmitButton>
    </form>
  );
}
