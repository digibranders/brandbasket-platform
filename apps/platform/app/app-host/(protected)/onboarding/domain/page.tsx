import type { Metadata } from "next";
import { EmailUs } from "@/components/panel/email-us";
import type { ReactElement } from "react";
import { DomainStepForm } from "@/components/panel/domain-step-form";
import { DomainSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepHeading } from "@/components/panel/step-heading";
import { clientSiteBaseDomain, isTemporarySubdomain } from "@fynix/shared/lib/onboarding/domain-form";

import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { saveDomainStep, useTemporarySubdomainAction } from "./actions";

export const metadata: Metadata = { title: "Your domain" };

export default async function DomainStepPage(): Promise<ReactElement> {
  await requireCustomerAccess();
  const snapshot = await getOnboardingSnapshot();
  const temporaryAddressOffered = clientSiteBaseDomain() !== null;

  if (snapshot.locked) {
    return (
      <>
        <StepHeading step="domain" />
        <SummaryCard title="Your domain">
          <DomainSummary domain={snapshot.domain} />
        </SummaryCard>
      </>
    );
  }

  return (
    <>
      <StepHeading step="domain">
        <p>
          The web address your website will live at.{" "}
          {temporaryAddressOffered ? "Don’t have one yet? Use a free temporary address for now and switch to your own domain later." : null} Any questions, email us at{" "}
          <EmailUs />
          .
        </p>
      </StepHeading>
      <div className="rounded-card border border-line bg-card p-6 sm:p-8">
        <DomainStepForm
          action={saveDomainStep}
          useSubdomainAction={useTemporarySubdomainAction}
          hostname={snapshot.domain?.hostname ?? null}
          ownerConfirmed={(snapshot.domain?.ownerConfirmedAt ?? null) !== null}
          temporaryAddressOffered={temporaryAddressOffered}
          onTemporarySubdomain={snapshot.domain !== null && isTemporarySubdomain(snapshot.domain.hostname)}
        />
      </div>
    </>
  );
}
