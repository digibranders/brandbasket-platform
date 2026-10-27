"use client";

import type { ReactElement } from "react";
import { ServiceListEditor } from "@/components/panel/service-list-editor";
import {
  HTTPS_LINK_PATTERN,
  HTTPS_LINK_TITLE,
  InlineError,
  STEP_BODY_CLASSES,
  STEP_FIELD_CLASSES,
  STEP_HINT_CLASSES,
  STEP_LABEL_CLASSES,
  StepFooter,
  StepFormError,
  StepTextArea,
  useStepForm,
  type StepAction,
} from "@/components/panel/step-form";
import { MAX_REFERENCE_URLS, type ServiceInput } from "@/lib/onboarding/content-form";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";

export interface SavedBrief {
  readonly notesForBuilder: string | null;
  readonly styleLikes: string | null;
  readonly referenceUrls: readonly string[];
}

interface ContentStepFormProps {
  readonly action: StepAction;
  readonly services: readonly ServiceInput[];
  readonly brief: SavedBrief;
  /** The customer's billing currency, so example prices are in money they recognise. Null when unknown. */
  readonly currency: MoneyCurrency | null;
}

/** Step 02: what the business offers, and anything the builder should know. */
export function ContentStepForm({ action, services, brief, currency }: ContentStepFormProps): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });
  const referenceSlots = Array.from({ length: MAX_REFERENCE_URLS }, (_, index) => index);

  return (
    <form ref={formRef} action={formAction} noValidate className="group/step">
      <div className={STEP_BODY_CLASSES}>
        <div>
          <ServiceListEditor
            initial={services}
            invalidField={controls.invalidField}
            errorId={controls.errorId}
            currency={currency}
            renderError={(index) => <InlineError controls={controls} match={new RegExp(`^services\\.${String(index)}\\.`)} />}
          />
          <InlineError controls={controls} match="services" />
        </div>

        <div className="grid gap-5 border-t border-line pt-6">
          <StepTextArea
            controls={controls}
            name="notesForBuilder"
            label="Anything else we should know?"
            hint="Offers, awards, what makes you different, anything you want on the site or kept off it."
            saved={brief.notesForBuilder}
            maxLength={2000}
            rows={5}
          />

          <fieldset>
            <legend className={STEP_LABEL_CLASSES}>
              Websites you like the look of <span className="font-medium text-ink-2">(optional)</span>
            </legend>
            <p className={STEP_HINT_CLASSES}>Up to {MAX_REFERENCE_URLS}. They don’t need to be in your line of work.</p>
            <div className="mt-2 grid gap-2">
              {referenceSlots.map((index) => {
                const name = `referenceUrls.${index}`;
                return (
                  <div key={name}>
                    <label htmlFor={`field-${name}`} className="sr-only">
                      Website {index + 1}
                    </label>
                    <input
                      id={`field-${name}`}
                      name={name}
                      type="url"
                      inputMode="url"
                      spellCheck={false}
                      autoCapitalize="none"
                      maxLength={500}
                      pattern={HTTPS_LINK_PATTERN}
                      title={HTTPS_LINK_TITLE}
                      placeholder="https://"
                      defaultValue={controls.valueOf(name, brief.referenceUrls[index] ?? null)}
                      className={`${STEP_FIELD_CLASSES} mt-0!`}
                      {...controls.fieldStatus(name)}
                    />
                    <InlineError controls={controls} match={name} />
                  </div>
                );
              })}
            </div>
          </fieldset>

          <StepTextArea
            controls={controls}
            name="styleLikes"
            label="Anything you’d like it to feel like?"
            hint="Calm and clinical, warm and local, bold and bright. Colours you love or can’t stand."
            saved={brief.styleLikes}
            maxLength={600}
            rows={3}
          />
        </div>

        <StepFormError controls={controls} errorRef={errorRef} />
      </div>
      <StepFooter controls={controls} step="content" label="Save and continue" pendingLabel="Saving…" note="Saved when you continue." />
    </form>
  );
}
