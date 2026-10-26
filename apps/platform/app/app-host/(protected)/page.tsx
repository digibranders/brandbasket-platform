import type { Metadata } from "next";
import type { ReactElement } from "react";
import { isPhoneAccountEmail } from "@brandbasket/db";
import { BillingBanner } from "@/components/panel/billing-banner";
import { NextStepCard } from "@/components/panel/next-step-card";
import { WelcomeOverview } from "@/components/first-look/welcome-overview";
import { MonthOverview } from "@/components/overview/month-overview";
import { inFirstLook } from "@/lib/first-look";
import { loadFirstLook } from "@/lib/server/first-look";
import { firstName } from "@brandbasket/shared/lib/names";
import { nextStep } from "@brandbasket/shared/lib/next-step";
import { projectStageIndex } from "@/lib/project-stages";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadOverview } from "@/lib/server/overview";
import { loadTodo } from "@/lib/server/todo";
import { doneSetupOf } from "@/lib/todo";

export const metadata: Metadata = { title: "Home" };

export default async function AppHomePage(): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess();
  const [overview, banner, liveWebsite] = await Promise.all([
    getProjectOverview(),
    getBillingBanner(),
    getLiveWebsite(),
  ]);
  const { project, completed } = overview;
  const step = nextStep({ project, completedSteps: completed, liveWebsite });
  // Going live closes the project, so `overview.project` is null from launch onwards and the live site is the only
  // thing that still knows the status. Without this the build list falls back to the state it shows a customer who has
  // not started, on the very screen that tells them their website is up.
  const status = liveWebsite === null ? (project?.status ?? null) : "live";

  const callState = await getSetupCallState(tenant);

  // The first look (plan 28 section 3): until the kickoff call has happened, Overview is the Welcome overview.
  const firstLook = inFirstLook({
    hasAccess: billing.hasAccess,
    websiteLive: liveWebsite !== null,
    setupSent: project?.onboardingSubmittedAt != null,
    callHeld: callState.booking?.heldAtIso != null,
    callEndsAtIso: callState.booking?.endsAtIso ?? null,
    nowMs: callState.readAtMs,
  });
  if (firstLook) {
    // loadTodo is request-cached: the shell reads it for the rail count.
    const [{ services, payment }, todo] = await Promise.all([loadFirstLook(tenant), loadTodo(tenant)]);
    return (
      <>
        {banner === null ? null : (
          <div className="mx-auto mb-5 w-full max-w-[68rem]">
            <BillingBanner banner={banner} />
          </div>
        )}
        <WelcomeOverview
          firstName={firstName(user.name)}
          services={services}
          payment={payment}
          call={callState.booking === null ? null : { startsAtIso: callState.booking.startsAtIso, endsAtIso: callState.booking.endsAtIso }}
          bookingUrl={callState.url}
          doneSteps={completed}
          doneSetup={doneSetupOf(todo.items)}
          canBook={!isPhoneAccountEmail(user.email)}
        />
      </>
    );
  }
  const now = new Date(callState.readAtMs);
  const data = await loadOverview(tenant, billing, now);
  const showsBuildCard = step.kind === "building" || step.kind === "on-hold" || step.kind === "review" || step.kind === "approved" || step.kind === "live";
  return (
    <>
      {banner === null ? null : (
        <div className="mx-auto mb-5 w-full max-w-[68rem]">
          <BillingBanner banner={banner} />
        </div>
      )}
      <MonthOverview
        firstName={firstName(user.name)}
        businessName={tenant.businessName}
        data={data}
        now={now}
        bookingUrl={callState.url}
        buildCard={
          showsBuildCard ? (
            <NextStepCard
              step={step}
              buildStageIndex={status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null })}
            />
          ) : null
        }
      />
    </>
  );
}
