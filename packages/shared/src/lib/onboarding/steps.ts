export type OnboardingStepKey = "business" | "content" | "brand" | "domain" | "review";

export interface OnboardingStepInfo {
  readonly key: OnboardingStepKey;
  readonly title: string;
  readonly blurb: string;
}

/** The five steps, in order. Every page, link and progress count reads from here. */
export const ONBOARDING_STEPS: readonly OnboardingStepInfo[] = [
  { key: "business", title: "Your business", blurb: "Name, contact details and opening hours." },
  { key: "content", title: "What you offer", blurb: "Your services and anything we should know." },
  { key: "brand", title: "Logo and photos", blurb: "The pictures that will make it look like you." },
  { key: "domain", title: "Your domain", blurb: "The web address your website will live at." },
  { key: "review", title: "Check and send", blurb: "Look it over, then send it to us." },
];

/** The steps that hold answers; "review" is where they are sent, so it is never completed on its own. */
export const ANSWER_STEPS: readonly OnboardingStepKey[] = ["business", "content", "brand", "domain"];

export function onboardingStepHref(step: OnboardingStepKey): string {
  return `/onboarding/${step}`;
}

export function stepAfter(step: OnboardingStepKey): OnboardingStepKey | null {
  const index = ONBOARDING_STEPS.findIndex((info) => info.key === step);
  return ONBOARDING_STEPS[index + 1]?.key ?? null;
}

/** Where a saved step moves on to: the next step, or the review for the last one. */
export function hrefAfter(step: OnboardingStepKey): string {
  return onboardingStepHref(stepAfter(step) ?? "review");
}

/** Where "Continue" should land: the first answer step not yet done, or the review once they all are. */
export function firstIncompleteStep(completed: ReadonlySet<OnboardingStepKey>): OnboardingStepKey {
  return ANSWER_STEPS.find((step) => !completed.has(step)) ?? "review";
}

export function stepInfo(step: OnboardingStepKey): OnboardingStepInfo {
  const info = ONBOARDING_STEPS.find((candidate) => candidate.key === step);
  if (info === undefined) throw new RangeError(`Unknown onboarding step: ${step}`);
  return info;
}
