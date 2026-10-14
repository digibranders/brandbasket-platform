"use client";

import type { ReactElement } from "react";

import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import {
  StepFormError,
  StepSubmit,
  StepTextField,
  useStepForm,
  type StepAction,
} from "@/components/panel/step-form";

interface DomainStepFormProps {
  readonly action: StepAction;
  readonly useSubdomainAction: StepAction;
  readonly hostname: string | null;
  readonly ownerConfirmed: boolean;
  /** Whether the deployment makes temporary addresses at all (CLIENT_SITE_BASE_DOMAIN, or Fynix Digital's own default). */
  readonly temporaryAddressOffered: boolean;
  /** Whether `hostname` is one of those temporary addresses: read on the server, which knows the base domain. */
  readonly onTemporarySubdomain: boolean;
}

/** Step 04: the one web address the website will live at, or a free temporary address for now. */
export function DomainStepForm({
  action,
  useSubdomainAction,
  hostname,
  ownerConfirmed,
  temporaryAddressOffered,
  onTemporarySubdomain,
}: DomainStepFormProps): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action);
  const {
    formRef: subdomainFormRef,
    errorRef: subdomainErrorRef,
    formAction: subdomainFormAction,
    controls: subdomainControls,
  } = useStepForm(useSubdomainAction);
  // A temporary temporary address was never "confirmed" in the sense this checkbox means, whatever the stored
  // ownerConfirmedAt says: the checkbox is asking about the real domain they're about to type in, not that one.
  const confirmed =
    controls.state.status === "error" ? "ownerConfirmed" in controls.state.values : ownerConfirmed && !onTemporarySubdomain;

  return (
    <div className="space-y-8">
      {onTemporarySubdomain ? (
        <p className="rounded-control bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
          You’re using the free address <span className="font-medium text-ink">{hostname}</span> for now. Enter your
          own domain below whenever you’ve registered one, and it’ll replace this address.
        </p>
      ) : null}

      <form ref={formRef} action={formAction} noValidate className="space-y-6">
        <StepTextField
          controls={controls}
          name="domain"
          label="Your domain"
          hint="Paste it however you have it. We only need the name, for example yourbusiness.com."
          type="text"
          saved={onTemporarySubdomain ? null : hostname}
          maxLength={300}
          autoComplete="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourbusiness.com"
          required
        />

        <label className="flex items-start gap-3 rounded-control border border-line bg-paper/60 px-4 py-3">
          <input
            type="checkbox"
            name="ownerConfirmed"
            defaultChecked={confirmed}
            required
            className="mt-1 size-4 shrink-0 accent-accent"
            {...controls.fieldStatus("ownerConfirmed")}
          />
          <span>
            I own this domain, or I can get into the account it’s registered with.
            <RequiredMark />
          </span>
        </label>

        <p className="rounded-control bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
          You’ll need to change two settings with the company you bought it from. We’ll show you exactly what to
          change once your website is approved. We’ll never ask for your login.
        </p>

        <StepFormError controls={controls} errorRef={errorRef} />
        <StepSubmit controls={controls} label="Save and continue" pendingLabel="Saving…" />
      </form>

      {onTemporarySubdomain || !temporaryAddressOffered ? null : (
        <form ref={subdomainFormRef} action={subdomainFormAction} noValidate className="border-t border-line pt-6">
          <p className="text-sm leading-relaxed text-ink-soft">
            {"Don’t have a domain yet? We’ll put your website live on a free temporary address so there’s nothing stopping you, and you can move to your own domain whenever you’ve registered one."}
          </p>
          <StepFormError controls={subdomainControls} errorRef={subdomainErrorRef} />
          <div className="mt-4">
            <StepSubmit controls={subdomainControls} label={"Use a free temporary address for now"} pendingLabel="Setting it up…" />
          </div>
        </form>
      )}
    </div>
  );
}
