import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";

/** One answer (or group of answers) and the place on the live website, or the thing we do, that it is for. */
export interface StepNote {
  readonly answer: string;
  readonly use: string;
}

/**
 * The "What this is for" aside of each step of the website setup: where the answers appear on the live website.
 * Plain sentences; they are copy, so a change here goes to the owner first.
 */
export const STEP_NOTES: Readonly<Record<OnboardingStepKey, readonly StepNote[]>> = {
  business: [
    { answer: "Name and tagline", use: "The top of every page and your home page." },
    { answer: "Phone, email and address", use: "Your contact details, with a click-to-call button on phones." },
    { answer: "Opening hours", use: "Your contact details, so people know when to come." },
  ],
  content: [
    { answer: "Your services", use: "Your services page, one after another in the order you set." },
    { answer: "Notes, feel and websites you like", use: "Not shown. We read them before we start building." },
  ],
  brand: [
    { answer: "Logo", use: "The top of every page." },
    { answer: "Photos", use: "Your home page and your pages, each with its description read out to people who can’t see it." },
  ],
  domain: [
    { answer: "Your domain", use: "The address people type to find you." },
    { answer: "A free address", use: "Works straight away. Switch to your own domain whenever you’ve registered one." },
  ],
  review: [
    { answer: "Pay and send", use: "Once you pay, we start building and your answers lock. You can still email us about changes." },
  ],
};

/** The words above the notes. */
export const STEP_NOTES_TITLE = "What this is for";

export function stepNotes(step: OnboardingStepKey): readonly StepNote[] {
  return STEP_NOTES[step];
}

