import "server-only";
import { deriveSiteStatus } from "@firstfold/billing";
import { cache } from "react";
import { noticesFrom, type AccountPanel } from "@firstfold/shared/lib/account-panel";
import { nextStep } from "@firstfold/shared/lib/next-step";
import { getBillingBanner } from "./billing-banner";
import { requireCustomerAccess } from "./customer-access";
import { getLatestProjectStatus, getLiveWebsite, getProjectOverview } from "./onboarding";

export type { AccountPanel };

/**
 * Everything the sidebar's account bar needs, gathered in one place.
 *
 * Every read below is already `cache()`d and already used by a screen the customer can reach, so on most pages this
 * costs nothing beyond the assembly: the layout asks for it, and whichever page also wants the banner or the project
 * gets the same cached answer.
 *
 * Customer surface only. The staff console has no single business in view, so admin-shell passes no panel and the
 * bar renders without a bell (see components/panel/dashboard-frame.tsx).
 */
export const getAccountPanel = cache(async (): Promise<AccountPanel> => {
  const { billing } = await requireCustomerAccess();
  const [banner, overview, liveWebsite, projectStatus] = await Promise.all([
    getBillingBanner(),
    getProjectOverview(),
    getLiveWebsite(),
    getLatestProjectStatus(),
  ]);

  return {
    notices: noticesFrom({
      banner,
      projectStatus,
      nextStep: nextStep({ project: overview.project, completedSteps: overview.completed, liveWebsite }),
    }),
    liveWebsiteUrl: liveWebsite === null ? null : `https://${liveWebsite.hostname}`,
    siteStatus: deriveSiteStatus(
      { projectStatus: projectStatus ?? "onboarding", subscription: billing.subscription },
      new Date(),
    ),
  };
});
