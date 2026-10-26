import type { Metadata } from "next";
import type { ReactElement } from "react";
import { isPhoneAccountEmail } from "@brandbasket/db";
import { BillingBanner } from "@/components/panel/billing-banner";
import { KickoffCallCard } from "@/components/panel/kickoff-call-card";
import { LaunchPath } from "@/components/panel/launch-path";
import { NextStepCard } from "@/components/panel/next-step-card";
import { PaidBadge } from "@/components/panel/paid-badge";
import { PrepareChecklist } from "@/components/panel/prepare-checklist";
import { TeamCallCard } from "@/components/panel/team-call-card";
import { WelcomeOverview } from "@/components/first-look/welcome-overview";
import { inFirstLook } from "@/lib/first-look";
import { loadFirstLook } from "@/lib/server/first-look";
import { firstName } from "@brandbasket/shared/lib/names";
import { nextStep, type NextStep } from "@brandbasket/shared/lib/next-step";
import { projectStageIndex } from "@/lib/project-stages";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadTodo } from "@/lib/server/todo";
import { doneSetupOf } from "@/lib/todo";

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
  const setupCall = settingUp ? callState : null;
  // After setup, a call can be booked at any time; one that has taken place no longer counts, so another can be booked.
  const callStart = callState.booking?.startsAtIso ?? null;
  const upcomingCall =
    callStart !== null && Date.parse(callStart) > callState.readAtMs ? { startsAtIso: callStart, endsAtIso: callState.booking?.endsAtIso ?? null } : null;
  const email = isPhoneAccountEmail(user.email) ? null : user.email;
  const paidAt = billing.subscription?.activatedAt ?? null;
  const booked = setupCall?.booking != null;
  // With no booking page set there is nothing to book, so the lede speaks only of getting online.
  const subtitle = settingUp && booked ? BOOKED_SUBTITLE : settingUp && setupCall?.url != null ? BOOKING_SUBTITLE : SUBTITLES[step.kind];

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
          // Option A, "Kickoff studio" (owner's pick, 2026-10-23): the call and the launch path side by side, the steps below.
          <div className="space-y-5">
            <div className="flex flex-wrap items-start gap-5">
              <div className="min-w-0 flex-[999_1_36rem]">
                <KickoffCallCard
                  url={setupCall.url}
                  booking={setupCall.booking}
                  prefill={{ name: user.name, email }}
                  businessId={tenant.businessId}
                />
              </div>
              <div className="min-w-0 flex-[1_1_17rem]">
                <LaunchPath paidAtIso={paidAt?.toISOString() ?? null} booked={booked} callStartsAtIso={setupCall.booking?.startsAtIso ?? null} />
              </div>
            </div>
            <PrepareChecklist completedSteps={completed} />
          </div>
        )}
      </div>
    </>
  );
}
