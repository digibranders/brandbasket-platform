import { redirect } from "next/navigation";
import { firstIncompleteStep, onboardingStepHref } from "@brandbasket/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";

/** "Set up your website" lands on the first step still to do, or on the summary once everything has been sent. */
export default async function OnboardingIndexPage(): Promise<never> {
  await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();
  redirect(onboardingStepHref(snapshot.locked ? "review" : firstIncompleteStep(new Set(snapshot.completed))));
}
