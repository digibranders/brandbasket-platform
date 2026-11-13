import { permanentRedirect } from "next/navigation";
import { onboardingReviewDestination, type SearchParams } from "@/features/checkout/rules/old-paths";

/** The old Check and send page. Its `?payment=` is Razorpay's live return, which lands on the checkout; otherwise the checklist. */
export default async function OnboardingReviewRedirect({ searchParams }: { readonly searchParams: Promise<SearchParams> }): Promise<never> {
  permanentRedirect(onboardingReviewDestination(await searchParams));
}
