import type { Metadata } from "next";
import type { ReactElement } from "react";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { cn } from "@brandbasket/shared/lib/cn";
import { AddressCard } from "@/components/website/address-card";
import { ProgressCard } from "@/components/website/preview-card";
import { Timeline } from "@/components/website/timeline";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadWebsite } from "@/lib/server/website";
import { addressCardView, siteAddress } from "@/lib/website/address";
import { readWebsiteNotice, WEBSITE_NOTICES } from "@/lib/website/notices";

export const metadata: Metadata = { title: "Your website" };

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

  return (
    <>
      <h1 className="sr-only">Progress</h1>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="grid gap-4">
          {notice === null ? null : (
            <p role={WEBSITE_NOTICES[notice].ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", WEBSITE_NOTICES[notice].ok ? "text-sage-deep" : "text-error")}>
              {WEBSITE_NOTICES[notice].text}
            </p>
          )}
          <ProgressCard
            view={view}
            pictureUrl={data.pictureUrl}
            previewUrl={project?.previewUrl ?? null}
            address={address}
            businessName={tenant.businessName}
            liveHostname={live?.hostname ?? null}
          />
        </div>
        {data.steps.length === 0 && addressCard === null ? null : (
          <div className="grid gap-8">
            {data.steps.length === 0 || view.kind === "none" ? null : <Timeline steps={data.steps} />}
            {addressCard === null ? null : <AddressCard view={addressCard} />}
          </div>
        )}
      </div>
    </>
  );
}
