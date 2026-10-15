import type { ReactElement, ReactNode } from "react";
import { EmailUs } from "@/components/panel/email-us";
import { LockedNotice } from "@/components/panel/onboarding-summary";
import { OnboardingSteps } from "@/components/panel/onboarding-steps";
import { SetupCallCard } from "@/components/panel/setup-call-card";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { getSetupCallUrl } from "@/lib/server/setup-call-link";

interface OnboardingLayoutProps {
  readonly children: ReactNode;
}

export default async function OnboardingLayout({ children }: OnboardingLayoutProps): Promise<ReactElement> {
  await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();
  const setupCallUrl = await getSetupCallUrl();

  return (
    <>
      <h1 className="panel-title">
        Set up your <em>website.</em>
      </h1>
      {snapshot.locked ? null : (
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Five steps. Each one is saved when you continue, so you can stop and come back whenever you like.
        </p>
      )}

      {/* Until the setup has been sent: after that there is nothing left to set up together. */}
      {setupCallUrl === null || snapshot.project === null || snapshot.locked ? null : <SetupCallCard href={setupCallUrl} />}

      {snapshot.project === null ? (
        <p role="status" className="mt-6 rounded-control bg-paper-deep px-5 py-4 text-ink-soft">
          There’s nothing to set up right now. If you think that’s wrong, email us at{" "}
          <EmailUs />
          .
        </p>
      ) : snapshot.locked ? (
        <div className="mt-6">
          <LockedNotice />
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <OnboardingSteps completed={snapshot.completed} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
