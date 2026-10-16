import type { Metadata } from "next";
import type { ReactElement } from "react";
import { isPhoneAccountEmail } from "@fynix/db";
import { BillingBanner } from "@/components/panel/billing-banner";
import { KickoffCallCard } from "@/components/panel/kickoff-call-card";
import { NextStepCard } from "@/components/panel/next-step-card";
import { PaidBadge } from "@/components/panel/paid-badge";
import { PrepareChecklist } from "@/components/panel/prepare-checklist";
import { TeamCallCard } from "@/components/panel/team-call-card";
import { firstName } from "@fynix/shared/lib/names";
import { nextStep, type NextStep } from "@fynix/shared/lib/next-step";
import { projectStageIndex } from "@/lib/project-stages";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";

export const metadata: Metadata = { title: "Home" };

const SUBTITLES: Readonly<Record<NextStep["kind"], string>> = {
  "start-onboarding": "Let’s get your business online.",
  "continue-onboarding": "Let’s get your business online.",
  building: "Your website is on its way.",
  "on-hold": "We’ll be in touch soon.",
  review: "Your website is ready for you to look at.",
  approved: "Your website is nearly live.",
  live: "Your website is live.",
  none: "Welcome back.",
};

const BOOKED_SUBTITLE = "Your call is booked. Get the steps ready before then.";
const BOOKING_SUBTITLE = "First, pick a time for your kickoff call.";

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

  // Until the setup is sent, the home screen is about two things: booking the kickoff call, and having the steps ready for it.
  const settingUp = step.kind === "start-onboarding" || step.kind === "continue-onboarding";
  const callState = await getSetupCallState(tenant);
  const setupCall = settingUp ? callState : null;
  // After setup, a call can be booked at any time; one that has taken place no longer counts, so another can be booked.
  const callStart = callState.booking?.startsAtIso ?? null;
  const upcomingCall =
    callStart !== null && Date.parse(callStart) > callState.readAtMs ? { startsAtIso: callStart, endsAtIso: callState.booking?.endsAtIso ?? null } : null;
  const email = isPhoneAccountEmail(user.email) ? null : user.email;
  const paidAt = billing.subscription?.activatedAt ?? null;
  const booked = setupCall?.booking != null;
  // One thing to do at a time: pick a time first, and the steps to prepare appear once a call is booked. With no booking page
  // set there is nothing to book, so the steps are shown straight away.
  const showSteps = booked || setupCall?.url === null;
  const subtitle = settingUp && booked ? BOOKED_SUBTITLE : settingUp && !showSteps ? BOOKING_SUBTITLE : SUBTITLES[step.kind];

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:items-center">
        <div>
          <h1 className="panel-title">
            Hello, <em>{firstName(user.name)}.</em>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>
        </div>
        <div className="flex flex-col items-start gap-4 xl:items-end">
          {banner === null ? null : <BillingBanner banner={banner} />}
          {settingUp && paidAt !== null ? (
            <PaidBadge paidAtIso={paidAt.toISOString()} serverNowMs={setupCall?.readAtMs ?? 0} booking={setupCall?.booking ?? null} />
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        {setupCall === null ? (
          <div className="space-y-6">
            <NextStepCard
              step={step}
              buildStageIndex={status === null ? 0 : projectStageIndex({ status, onboardingSubmittedAt: project?.onboardingSubmittedAt ?? null })}
            />
            {callState.url === null ? null : (
              <div className="max-w-4xl">
                <TeamCallCard url={callState.url} upcoming={upcomingCall} email={email} />
              </div>
            )}
          </div>
        ) : (
          <div className={showSteps ? "grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start" : "max-w-4xl"}>
            <KickoffCallCard
              url={setupCall.url}
              booking={setupCall.booking}
              prefill={{ name: user.name, email }}
              businessId={tenant.businessId}
            />
            {showSteps ? <PrepareChecklist completedSteps={completed} /> : null}
          </div>
        )}
      </div>
    </>
  );
}
