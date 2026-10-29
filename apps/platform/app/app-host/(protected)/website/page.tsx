import { Globe } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { ReactElement } from "react";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { cn } from "@brandbasket/shared/lib/cn";
import { DARK_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns } from "@/components/v2/page";
import { AddressCard } from "@/components/website/address-card";
import { BoughtSection } from "@/components/website/bought-section";
import { ProgressCard } from "@/components/website/preview-card";
import { Timeline } from "@/components/website/timeline";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadWebsite } from "@/lib/server/website";
import { addressCardView, siteAddress } from "@/lib/website/address";
import { roundsLine } from "@/lib/website/progress-view";
import { readWebsiteNotice, WEBSITE_NOTICES } from "@/lib/website/notices";
import { askAboutHref } from "@/lib/website/tabs";

export const metadata: Metadata = { title: "Website" };

interface WebsitePageProps {
  readonly searchParams: Promise<{ readonly response?: string | string[] }>;
}

/** Progress: the preview or the status, what happens next, and the web address when it needs something. */
export default async function WebsitePage({ searchParams }: WebsitePageProps): Promise<ReactElement> {
  const { tenant } = await requireWebsiteClient();
  const { response } = await searchParams;
  const notice = readWebsiteNotice(response);
  const data = await loadWebsite(tenant, new Date());
  const { project, domain, live, view } = data;

  const domainIsTemporary = domain !== null && isTemporarySubdomain(domain.hostname);
  const address = siteAddress({ liveHostname: live?.hostname ?? null, domainHostname: domain?.hostname ?? null, domainIsTemporary });
  const addressCard = addressCardView({
    domain: domain === null ? null : { hostname: domain.hostname, status: domain.status },
    isFreeAddress: domainIsTemporary,
    live: live !== null,
    projectStatus: project?.status ?? null,
  });

  const noticeLine =
    notice === null ? null : (
      <p role={WEBSITE_NOTICES[notice].ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", WEBSITE_NOTICES[notice].ok ? "text-sage-deep" : "text-error")}>
        {WEBSITE_NOTICES[notice].text}
      </p>
    );
  const showsTimeline = data.steps.length > 0 && view.kind !== "none";
  const hasAside = showsTimeline || addressCard !== null || data.bought.length > 0;

  return (
    <PageColumns
      main={
        <>
          {noticeLine}
          {view.kind === "none" ? (
            <EmptyState
              icon={Globe}
              title={view.title}
              text="When there is a website or a big change to build, you can follow it here."
              action={
                <Link href={askAboutHref("")} className={DARK_BUTTON}>
                  Ask for a change
                </Link>
              }
            />
          ) : (
            <ProgressCard
              view={view}
              pictureUrl={data.pictureUrl}
              previewUrl={project?.previewUrl ?? null}
              address={address}
              businessName={tenant.businessName}
              liveHostname={live?.hostname ?? null}
              feedbackKey={randomUUID()}
              roundsLine={roundsLine(project?.revisionRoundsIncluded ?? 0, project?.revisionRoundsGranted ?? 0)}
            />
          )}
        </>
      }
      aside={
        hasAside ? (
          <>
            {showsTimeline ? <Timeline steps={data.steps} /> : null}
            {addressCard === null ? null : <AddressCard view={addressCard} />}
            {data.bought.length === 0 ? null : <BoughtSection rows={data.bought} payment={data.payment} />}
          </>
        ) : null
      }
    />
  );
}
