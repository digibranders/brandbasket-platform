import type { Metadata } from "next";
import type { ReactElement } from "react";
import { isPhoneAccountEmail } from "@brandbasket/db";
import { PaymentWelcome } from "@/components/first-look/payment-welcome";
import { BillingBanner } from "@/components/panel/billing-banner";
import { UnpaidHome } from "@/components/panel/unpaid-home";
import { KickoffHome } from "@/components/home/kickoff-home";
import { OngoingHome } from "@/components/home/ongoing-home";
import { ProgressHome } from "@/components/home/progress-home";
import { PageFrame } from "@/components/v2/page";
import { andList, SERVICE_NAMES } from "@/lib/first-look";
import { homeLayoutOf } from "@/lib/home/state";
import { greetingFor } from "@/lib/overview";
import { projectStageIndex } from "@/lib/project-stages";
import { firstName } from "@brandbasket/shared/lib/names";
import { nextStep } from "@brandbasket/shared/lib/next-step";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadHome } from "@/lib/server/home";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";

export const metadata: Metadata = { title: "Home" };

const TODAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

/**
 * Home follows the customer's real state (lib/home/state.ts): a payment problem, the kickoff, the website being built and
 * reviewed, or the service a month in. The state is derived from stored facts, never from how long they have been here.
 * An account with a payment problem keeps its old setup Home: that page owns the pay and reactivate paths.
 */
export default async function AppHomePage(): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess();
  const now = new Date();
  const [banner, data] = await Promise.all([getBillingBanner(), loadHome(tenant, billing, now)]);
  const { state } = data;
  const layout = homeLayoutOf(state);

  if (state.kind === "payment_required" || state.kind === "payment_processing" || state.kind === "lapsed") {
    const [overview, liveWebsite] = await Promise.all([getProjectOverview(), getLiveWebsite()]);
    const { project, completed } = overview;
    const step = nextStep({ project, completedSteps: completed, liveWebsite });
    // Going live closes the project, so `overview.project` is null from launch onwards and the live site is the only
    // thing that still knows the status.
    const status = liveWebsite === null ? (project?.status ?? null) : "live";
    const buildStageIndex = status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null, previewSentAt: project?.previewSentAt ?? null });
    return <UnpaidHome firstName={firstName(user.name)} banner={banner} step={step} buildStageIndex={buildStageIndex} completedSteps={completed} />;
  }

  const names = data.services.map((service) => SERVICE_NAMES[service]);
  const lede = `${TODAY.format(now)}.${names.length === 0 ? "" : ` Your ${andList(names)} ${names.length === 1 ? "service is" : "services are"} active.`}`;
  return (
    <>
      {layout === "kickoff" ? <PaymentWelcome services={data.services} /> : null}
      <PageFrame title={`${greetingFor(now)}, ${firstName(user.name)}`} lede={lede}>
        {banner === null ? null : <BillingBanner banner={banner} />}
        {state.kind === "kickoff_unbooked" || state.kind === "kickoff_booked" ? (
          <KickoffHome state={state} services={data.services} intake={data.intake} bookingUrl={data.call.url} canBook={!isPhoneAccountEmail(user.email)} nowMs={data.call.readAtMs} />
        ) : state.kind === "ongoing" ? (
          <OngoingHome data={data} now={now} />
        ) : (
          <ProgressHome state={state} data={data} />
        )}
      </PageFrame>
    </>
  );
}
