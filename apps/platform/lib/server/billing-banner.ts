import "server-only";
import { cache } from "react";
import { billingBanner, PAYMENT_STEP_HREF, type BillingBannerModel } from "@brandbasket/shared/lib/billing/payment-step";
import { isOnboardingLocked } from "@/lib/onboarding/snapshot";
import { firstIncompleteStep, onboardingStepHref } from "@brandbasket/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "./customer-access";
import { getProjectOverview } from "./onboarding";
import { resolveAppliedDiscount } from "./referrals";

/**
 * The payment banner for the signed-in customer, or null. Read once per request: the layout shows it on every page
 * and the home screen places it in its header.
 */
export const getBillingBanner = cache(async (): Promise<BillingBannerModel | null> => {
  const { billing, tenant } = await requireCustomerAccess();
  const base = {
    status: billing.status,
    plan: billing.plan,
    paymentUnderReview: billing.paymentUnderReview,
    renewalFailingUntil: billing.renewalFailingUntil,
  };
  // Only an unpaid banner depends on setup progress or shows a price, so a paying or lapsed customer reads
  // neither, and never pays for the referral lookup.
  if (billing.status !== "unpaid") {
    return billingBanner({
      ...base,
      setupComplete: true,
      locked: true,
      nextStepHref: PAYMENT_STEP_HREF,
      discount: null,
    });
  }
  const { project, completed } = await getProjectOverview();
  // The same computation Check and send uses, so the banner's price and the Pay button's can never disagree.
  const discount =
    billing.plan === null ? null : await resolveAppliedDiscount(tenant.businessId, billing.plan, new Date());
  // Answers sent before payment was required: the build is waiting only on the payment.
  const locked = project !== null && isOnboardingLocked(project);
  const nextStep = firstIncompleteStep(new Set(completed));
  return billingBanner({
    ...base,
    setupComplete: locked || nextStep === "review",
    locked,
    nextStepHref: onboardingStepHref(nextStep),
    discount,
  });
});
