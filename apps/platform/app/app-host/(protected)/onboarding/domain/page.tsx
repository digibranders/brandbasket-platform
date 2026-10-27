import type { Metadata } from "next";
import { EmailUs } from "@/components/panel/email-us";
import type { ReactElement } from "react";
import { DomainStepForm, FreeAddressForm } from "@/components/panel/domain-step-form";
import { DomainSummary, SummaryCard } from "@/components/panel/onboarding-summary";
import { StepAside } from "@/components/panel/step-aside";
import { StepCard } from "@/components/panel/step-card";
import { PageColumns } from "@/components/v2/page";
import { slugify } from "@brandbasket/db";
import { clientSiteBaseDomain, isTemporarySubdomain, suggestSubdomainName } from "@brandbasket/shared/lib/onboarding/domain-form";

import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { saveDomainStep, useTemporarySubdomainAction } from "./actions";

export const metadata: Metadata = { title: "Your domain" };

export default async function DomainStepPage(): Promise<ReactElement> {
  const { tenant } = await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();
  const baseDomain = clientSiteBaseDomain();

  if (snapshot.locked) {
    return (
      <PageColumns
        main={
          <SummaryCard title="Your domain">
            <DomainSummary domain={snapshot.domain} />
          </SummaryCard>
        }
        aside={<StepAside step="domain" />}
      />
    );
  }

  const onTemporarySubdomain = snapshot.domain !== null && isTemporarySubdomain(snapshot.domain.hostname);

  return (
    <PageColumns
      main={
        <>
          <StepCard
            step="domain"
            intro={
              <p>
                The web address your website will live at.{" "}
                {baseDomain === null ? null : "Don’t have one yet? Choose a free address for now and switch to your own domain later."} Any questions, email us at{" "}
                <EmailUs />
                .
              </p>
            }
          >
            <DomainStepForm
              action={saveDomainStep}
              hostname={snapshot.domain?.hostname ?? null}
              ownerConfirmed={(snapshot.domain?.ownerConfirmedAt ?? null) !== null}
              onTemporarySubdomain={onTemporarySubdomain}
            />
          </StepCard>
          {baseDomain === null || onTemporarySubdomain ? null : (
            <FreeAddressForm
              action={useTemporarySubdomainAction}
              temporaryAddressBase={baseDomain}
              suggestedName={suggestSubdomainName(slugify(tenant.businessName))}
            />
          )}
        </>
      }
      aside={<StepAside step="domain" />}
    />
  );
}
