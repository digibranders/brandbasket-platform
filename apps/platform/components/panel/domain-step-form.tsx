"use client";

import { useState, type ReactElement } from "react";

import {
  InlineError,
  Required,
  STEP_BODY_CLASSES,
  STEP_FIELD_CLASSES,
  STEP_HINT_CLASSES,
  STEP_LABEL_CLASSES,
  StepFooter,
  StepFormError,
  StepSubmit,
  StepTextField,
  useStepForm,
  type StepAction,
} from "@/components/panel/step-form";
import { PageSection } from "@/components/v2/page";

interface DomainStepFormProps {
  readonly action: StepAction;
  readonly hostname: string | null;
  readonly ownerConfirmed: boolean;
  /** Whether `hostname` is one of the free temporary addresses: read on the server, which knows the base domain. */
  readonly onTemporarySubdomain: boolean;
}

/** Step 04: the one web address the website will live at. */
export function DomainStepForm({ action, hostname, ownerConfirmed, onTemporarySubdomain }: DomainStepFormProps): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });
  // A temporary temporary address was never "confirmed" in the sense this checkbox means, whatever the stored
  // ownerConfirmedAt says: the checkbox is asking about the real domain they're about to type in, not that one.
  const confirmed =
    controls.state.status === "error" ? "ownerConfirmed" in controls.state.values : ownerConfirmed && !onTemporarySubdomain;

  return (
    <form ref={formRef} action={formAction} noValidate className="group/step">
      <div className={STEP_BODY_CLASSES}>
        {onTemporarySubdomain ? (
          <p className="rounded-lg bg-sunken px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
            You’re using the free address <span className="font-semibold text-ink">{hostname}</span> for now. Enter your
            own domain below whenever you’ve registered one, and it’ll replace this address.
          </p>
        ) : null}

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

        <div>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="ownerConfirmed"
              defaultChecked={confirmed}
              required
              className="mt-0.5 size-[1.125rem] shrink-0 accent-ink"
              {...controls.fieldStatus("ownerConfirmed")}
            />
            <span>
              I own this domain, or I can get into the account it’s registered with.
              <Required />
            </span>
          </label>
          <InlineError controls={controls} match="ownerConfirmed" />
        </div>

        <p className={`${STEP_HINT_CLASSES} border-t border-line pt-5`}>
          You’ll need to change two settings with the company you bought it from. We’ll show you exactly what to
          change once your website is approved. We’ll never ask for your login.
        </p>

        <StepFormError controls={controls} errorRef={errorRef} />
      </div>
      <StepFooter controls={controls} step="domain" label="Save and continue" pendingLabel="Saving…" note="Saved when you continue." />
    </form>
  );
}

interface FreeAddressFormProps {
  readonly action: StepAction;
  /** The domain free addresses are made on (CLIENT_SITE_BASE_DOMAIN). */
  readonly temporaryAddressBase: string;
  /** The name offered first for the free address, made from the business name; empty when none would be allowed. */
  readonly suggestedName: string;
}

/** The other way through step 04: a free temporary address, for a business with no domain yet. It sits under the step's card, as a section of its own. */
export function FreeAddressForm({ action, temporaryAddressBase, suggestedName }: FreeAddressFormProps): ReactElement {
  const [name, setName] = useState(suggestedName);
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });

  return (
    <PageSection id="free-address" title="Don’t have a domain yet?">
      <form ref={formRef} action={formAction} noValidate className="group/step max-w-xl">
        <p className={STEP_HINT_CLASSES}>
          Choose a free address for your website, so there’s nothing stopping you. You can move to your own domain whenever you’ve
          registered one.
        </p>
        <label htmlFor="free-address-name" className={`mt-4 ${STEP_LABEL_CLASSES}`}>
          Your free address
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <input
            id="free-address-name"
            name="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourbusiness"
            aria-describedby="free-address-preview"
            className={`${STEP_FIELD_CLASSES} mt-0! min-w-0 flex-1 basis-40 sm:max-w-xs`}
            {...controls.fieldStatus("name")}
          />
          <span className="text-sm text-ink-2">.{temporaryAddressBase}</span>
        </div>
        <InlineError controls={controls} match="name" />
        <p id="free-address-preview" className="mt-2 text-[0.8125rem] text-ink-2">
          Your website will be at{" "}
          <span className="font-semibold text-ink">{name.trim() === "" ? "yourbusiness" : name.trim().toLowerCase()}.{temporaryAddressBase}</span>
        </p>
        <div className="mt-4">
          <StepFormError controls={controls} errorRef={errorRef} />
        </div>
        <StepSubmit soft controls={controls} label="Use this free address" pendingLabel="Setting it up…" />
      </form>
    </PageSection>
  );
}
