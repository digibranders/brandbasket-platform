import type { ReactElement } from "react";
import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { SetupCallLine } from "@/components/panel/setup-call-line";
import { PageSection } from "@/components/v2/page";
import { STEP_NOTES_TITLE, stepNotes } from "@/lib/onboarding/step-notes";

/** The right-hand column of a setup step: where its answers appear, then the quiet line about booking a call. */
export function StepAside({ step }: { readonly step: OnboardingStepKey }): ReactElement {
  return (
    <>
      <PageSection id={`${step}-purpose`} title={STEP_NOTES_TITLE}>
        <ul className="divide-y divide-line">
          {stepNotes(step).map((note) => (
            <li key={note.answer} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-semibold text-ink">{note.answer}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{note.use}</p>
            </li>
          ))}
        </ul>
      </PageSection>
      <SetupCallLine />
    </>
  );
}
