import { Clipboard } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement, ReactNode } from "react";
import { EmailUs } from "@/components/panel/email-us";
import { LockedNotice } from "@/components/panel/onboarding-summary";
import { OnboardingSteps } from "@/components/panel/onboarding-steps";
import { EmptyState, PageFrame } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";

interface OnboardingLayoutProps {
  readonly children: ReactNode;
}

export default async function OnboardingLayout({ children }: OnboardingLayoutProps): Promise<ReactElement> {
  await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();

  return (
    <PageFrame
      title="Set up your website"
      lede={snapshot.locked ? undefined : "Five steps. Each one is saved when you continue, so you can stop and come back whenever you like."}
    >
      {snapshot.project === null ? (
        <div role="status">
          <EmptyState
            compact
            icon={Clipboard}
            title="There’s nothing to set up right now."
            text={
              <>
                If you think that’s wrong, email us at <EmailUs />.
              </>
            }
          />
        </div>
      ) : snapshot.locked ? (
        <LockedNotice />
      ) : null}

      <OnboardingSteps completed={snapshot.completed} />
      {children}
    </PageFrame>
  );
}
